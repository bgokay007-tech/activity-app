import { useEffect, useState, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    RefreshControl, ActivityIndicator, TextInput, Modal,
    Alert, KeyboardAvoidingView, Platform, Switch, Linking, Image,
} from 'react-native';
import { useSelector } from 'react-redux';
import * as Location from 'expo-location';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';

// ─── Constants ────────────────────────────────────────────────────────────────

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
    tennis:     { name:'Tennis',     emoji:'🎾', color: colors.yellow  || '#eab308' },
    padel:      { name:'Padel',      emoji:'🏓', color: colors.cyan    || '#06b6d4' },
    football:   { name:'Football',   emoji:'⚽', color: colors.green   || '#16a34a' },
    basketball: { name:'Basketball', emoji:'🏀', color:'#f97316' },
    volleyball: { name:'Volleyball', emoji:'🏐', color:'#a855f7' },
    default:    { name:'Sport',      emoji:'🏅', color: colors.purple },
};

function getConfig(sub) {
    return SUB_CONFIG[sub] || { ...SUB_CONFIG.default, name: sub.charAt(0).toUpperCase()+sub.slice(1) };
}

function getTabs(sub) {
    if (sub === 'football' || sub === 'volleyball')
        return ['rivals', 'player_wanted', 'tournaments', 'coaches', 'archive', ...(sub==='football' ? ['referee'] : []), 'media'];
    if (sub === 'tennis')
        return ['rivals', 'tournaments', 'coaches', 'media', 'news', 'posts', 'archive'];
    return ['rivals', 'tournaments', 'coaches', 'archive', 'media'];
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

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

function RivalDetailModal({ visible, item, myId, sub, cfg, t, onClose, navigation, handleJoin, handleCancel, handleRespondJoin }) {
    const isOwner = item.senderId === myId;
    const participants = Array.isArray(item.participants) ? item.participants : [];
    const joinRequests = Array.isArray(item.joinRequests) ? item.joinRequests : [];
    const required = item.matchType === 'DOUBLE' ? 3 : (item.teamSize || 1);
    const filled = participants.length;
    const mySentReq = item._myJoinStatus;
    const isFull = filled >= required;
    const isParticipant = participants.some(p => p.id === myId);
    const isInvolved = isOwner || isParticipant || (mySentReq !== null && mySentReq !== undefined);

    const goToChat = (other) => {
        onClose();
        navigation.navigate('MessagesTab', {
            screen: 'Chat',
            params: { other, conversation: { id: null, _userId: other.id }, rival: { id: item.id, subCategory: item.subCategory, matchType: item.matchType, level: item.level, matchDate: item.matchDate, matchTime: item.matchTime, courtName: item.courtName } },
        });
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.modalOverlay}>
                <View style={[s.modalBox, { paddingBottom:24 }]}>
                    <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>{t.ilanDetail || 'İlan Detayı'}</Text>
                        <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Sender */}
                        <View style={[s.cardHeader, { marginBottom:10 }]}>
                            <Avatar name={item.sender?.username} size={42} color={cfg.color} />
                            <View style={{ flex:1 }}>
                                <Text style={s.cardName}>@{item.sender?.username}</Text>
                                {item.sender?.interests?.[0]?.skillRating > 0 && (
                                    <Text style={[s.ratingText, { color:cfg.color }]}>{Number(item.sender.interests[0].skillRating).toFixed(2)} ★</Text>
                                )}
                            </View>
                            <View style={{ alignItems:'flex-end', gap:4 }}>
                                <ModeBadge mode={item.matchMode} />
                                <View style={[s.modeBadge, { backgroundColor:cfg.color+'20', borderColor:cfg.color+'40' }]}>
                                    <Text style={[s.modeBadgeText, { color:cfg.color }]}>
                                        {TEAM_SPORTS.has(sub) ? `${item.teamSize||1}v${item.teamSize||1}` : (item.matchType==='DOUBLE' ? '2v2' : '1v1')}
                                    </Text>
                                </View>
                            </View>
                        </View>
                        {item.level && (
                            <View style={[s.levelRow, { marginBottom:10 }]}>
                                <Text style={s.levelBadge}>{LEVEL_EMOJI[item.level]} {t.levelTr[item.level] || item.level}</Text>
                                {item.levelDetail && <Text style={s.levelDetail}>{item.levelDetail}</Text>}
                            </View>
                        )}
                        {item.message && <Text style={[s.cardMsg, { marginBottom:10 }]}>{item.message}</Text>}
                        <View style={[s.cardMeta, { marginBottom:12 }]}>
                            {item.matchDate && <View style={s.metaItem}><Text style={s.metaItemText}>📅 {new Date(item.matchDate).toLocaleDateString(t.dateLocale,{day:'numeric',month:'short',weekday:'short'})}</Text></View>}
                            {item.matchTime && <View style={s.metaItem}><Text style={s.metaItemText}>🕐 {item.matchTime}</Text></View>}
                            {item.duration && <View style={s.metaItem}><Text style={s.metaItemText}>⏱ {item.duration} dk</Text></View>}
                            {item.courtName && <View style={s.metaItem}><Text style={[s.metaItemText,{color:'#60a5fa'}]}>🏟️ {item.courtName}</Text></View>}
                        </View>

                        {/* Oyuncular */}
                        <View style={det.section}>
                            <Text style={det.sectionTitle}>👥 {t.players || 'Oyuncular'} ({1 + filled} / {1 + required})</Text>
                            {/* Kurucu satırı */}
                            <View style={det.playerRow}>
                                <Avatar name={item.sender?.username} size={32} color={cfg.color} />
                                <View style={{ flex:1 }}>
                                    <Text style={det.playerName}>{item.sender?.fullName || item.sender?.username}</Text>
                                    <Text style={det.playerSub}>@{item.sender?.username} · {t.founder || 'Kurucu'}</Text>
                                </View>
                                {isInvolved && !isOwner && (
                                    <TouchableOpacity style={det.chatBtn} onPress={() => goToChat({ id: item.senderId, username: item.sender?.username, fullName: item.sender?.fullName, avatar: item.sender?.avatar })}>
                                        <Text style={det.chatBtnTxt}>💬</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            {/* Kabul edilen oyuncular */}
                            {participants.map((p, i) => (
                                <View key={p.id || i} style={det.playerRow}>
                                    <Avatar name={p.username} size={32} color={cfg.color} />
                                    <View style={{ flex:1 }}>
                                        <Text style={det.playerName}>{p.fullName || p.username}</Text>
                                        <Text style={det.playerSub}>@{p.username}</Text>
                                    </View>
                                    {isInvolved && p.id !== myId && (
                                        <TouchableOpacity style={det.chatBtn} onPress={() => goToChat({ id: p.id, username: p.username, fullName: p.fullName, avatar: p.avatar })}>
                                            <Text style={det.chatBtnTxt}>💬</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                            {filled === 0 && <Text style={det.emptyTxt}>{t.noPlayersYet || 'Henüz katılan yok'}</Text>}
                        </View>

                        {/* İstekler */}
                        {joinRequests.length > 0 && (
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
                                            {isOwner && (
                                                <>
                                                    <TouchableOpacity style={s.acceptBtn} onPress={() => handleRespondJoin(jr.id, 'accept')}>
                                                        <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }}>✓</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={s.declineBtn} onPress={() => handleRespondJoin(jr.id, 'reject')}>
                                                        <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }}>✕</Text>
                                                    </TouchableOpacity>
                                                </>
                                            )}
                                            {isInvolved && jr.user?.id !== myId && (
                                                <TouchableOpacity style={det.chatBtn} onPress={() => goToChat({ id: jr.user?.id, username: jr.user?.username, fullName: jr.user?.fullName, avatar: jr.user?.avatar })}>
                                                    <Text style={det.chatBtnTxt}>💬</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}
                    </ScrollView>

                    {/* Aksiyonlar */}
                    <View style={{ marginTop:12, gap:8 }}>
                        {isOwner ? (
                            <TouchableOpacity style={s.cancelBtn} onPress={() => { onClose(); setTimeout(handleCancel, 300); }}>
                                <Text style={s.cancelBtnText}>{t.cancelAdBtn}</Text>
                            </TouchableOpacity>
                        ) : mySentReq === 'PENDING' ? (
                            <View style={s.waitingBox}><Text style={s.waitingText}>{t.waitingReq}</Text></View>
                        ) : mySentReq === 'ACCEPTED' ? (
                            <View style={[s.waitingBox, { backgroundColor:'#16a34a20', borderColor:'#16a34a40' }]}>
                                <Text style={[s.waitingText, { color:'#4ade80' }]}>{t.requestAccepted || '✓ Kabul edildiniz!'}</Text>
                            </View>
                        ) : isFull ? (
                            <View style={s.waitingBox}><Text style={s.waitingText}>{t.ilanFull || 'İlan doldu'}</Text></View>
                        ) : item.flexibleSchedule ? (
                            <TouchableOpacity style={s.msgBtn} onPress={() => { onClose(); navigation.navigate('MessagesTab', { screen:'Chat', params:{ other:item.sender, conversation:{ id:null, _userId:item.senderId }, rival:{ id:item.id, subCategory:item.subCategory, matchType:item.matchType, level:item.level, matchDate:item.matchDate, matchTime:item.matchTime, location:item.location, courtName:item.courtName, flexibleSchedule:item.flexibleSchedule } } }); }}>
                                <Text style={s.msgBtnText}>{t.msgAtBtn}</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={{ flexDirection:'row', gap:8 }}>
                                <TouchableOpacity style={[s.msgBtn,{flex:1}]} onPress={() => { onClose(); navigation.navigate('MessagesTab', { screen:'Chat', params:{ other:item.sender, conversation:{ id:null, _userId:item.senderId }, rival:{ id:item.id, subCategory:item.subCategory, matchType:item.matchType, level:item.level, matchDate:item.matchDate, matchTime:item.matchTime, location:item.location, courtName:item.courtName, flexibleSchedule:item.flexibleSchedule } } }); }}>
                                    <Text style={s.msgBtnText}>{t.msgBtn}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.joinBtn,{backgroundColor:cfg.color,flex:2}]} onPress={() => { onClose(); setTimeout(handleJoin, 300); }}>
                                    <Text style={s.joinBtnText}>{t.joinBtn}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// ─── Rival Card ────────────────────────────────────────────────────────────────

function RivalCard({ item, myId, sub, onRefresh, navigation, onUserPress }) {
    const t = useT();
    const cfg = getConfig(sub);
    const isOwner = item.senderId === myId;
    const participants = Array.isArray(item.participants) ? item.participants : [];
    const required = item.matchType === 'DOUBLE' ? 3 : (item.teamSize || 1);
    const filled = participants.length;
    const mySentReq = item._myJoinStatus;
    const [detailVisible, setDetailVisible] = useState(false);

    const handleJoin = async () => {
        try {
            await api.post(`/rivals/${item.id}/respond`, {});
            Alert.alert('', t.requestSent);
            onRefresh();
        } catch (e) {
            const msg = e?.response?.data?.message || '';
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
                try { await api.delete(`/rivals/${item.id}`); onRefresh(); }
                catch(e) { Alert.alert(t.error, e?.response?.data?.message || t.deleteFailed); }
            }}
        ]);
    };

    const handleRespondJoin = async (jrId, action) => {
        try {
            await api.patch(`/rivals/join/${jrId}`, { action });
            onRefresh();
        } catch(e) { Alert.alert(t.error, e?.response?.data?.message || t.actionFailed); }
    };

    const rival = { id:item.id, subCategory:item.subCategory, matchType:item.matchType, level:item.level, matchDate:item.matchDate, matchTime:item.matchTime, location:item.location, courtName:item.courtName, flexibleSchedule:item.flexibleSchedule };

    return (
        <>
        <View style={[s.card, item.flexibleSchedule && { borderColor:'#eab30840' }]}>

            {/* ── Tappable info area → opens detail modal ── */}
            <TouchableOpacity activeOpacity={0.85} onPress={() => setDetailVisible(true)}>

                {/* Header */}
                <View style={s.cardHeader}>
                    <Avatar name={item.sender?.username} size={42} color={cfg.color} />
                    <View style={{ flex:1 }}>
                        <Text style={s.cardName}>@{item.sender?.username}</Text>
                        {item.sender?.interests?.[0]?.skillRating > 0 && (
                            <Text style={[s.ratingText, { color: cfg.color }]}>
                                {Number(item.sender.interests[0].skillRating).toFixed(2)} ★
                            </Text>
                        )}
                    </View>
                    <View style={{ alignItems:'flex-end', gap:4 }}>
                        <ModeBadge mode={item.matchMode} />
                        <View style={[s.modeBadge, { backgroundColor: cfg.color+'20', borderColor: cfg.color+'40' }]}>
                            <Text style={[s.modeBadgeText, { color: cfg.color }]}>
                                {TEAM_SPORTS.has(sub) ? `${item.teamSize||1}v${item.teamSize||1}` : (item.matchType==='DOUBLE' ? '2v2' : '1v1')}
                            </Text>
                        </View>
                        <Text style={s.joinedCount}>{t.joinedCount(filled, TEAM_SPORTS.has(sub) ? item.teamSize : required)}</Text>
                    </View>
                </View>

                {item.flexibleSchedule && (
                    <View style={s.flexBanner}>
                        <Text style={s.flexTitle}>{t.flexibleBanner}</Text>
                        <Text style={s.flexDesc}>{t.flexibleBannerDesc}</Text>
                    </View>
                )}
                {item.level && (
                    <View style={s.levelRow}>
                        <Text style={s.levelBadge}>{LEVEL_EMOJI[item.level]} {t.levelTr[item.level] || item.level}</Text>
                        {item.levelDetail && <Text style={s.levelDetail}>{item.levelDetail}</Text>}
                    </View>
                )}
                {item.message && <Text style={s.cardMsg}>{item.message}</Text>}
                {!item.flexibleSchedule && (
                    <View style={s.cardMeta}>
                        {item.matchDate && <View style={s.metaItem}><Text style={s.metaItemText}>📅 {new Date(item.matchDate).toLocaleDateString(t.dateLocale,{day:'numeric',month:'short',weekday:'short'})}</Text></View>}
                        {item.matchTime && <View style={s.metaItem}><Text style={s.metaItemText}>🕐 {item.matchTime}</Text></View>}
                        {item.duration && <View style={s.metaItem}><Text style={s.metaItemText}>⏱ {item.duration} dk</Text></View>}
                        {item.courtName && <View style={s.metaItem}><Text style={[s.metaItemText,{color:'#60a5fa'}]}>🏟️ {item.courtName}</Text></View>}
                    </View>
                )}
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

            {/* ── Aksiyon butonları — tıklanabilir alandan BAĞIMSIZ ── */}
            <View style={{ marginTop:10 }}>
                {isOwner ? (
                    <View style={s.ownerBtnRow}>
                        <TouchableOpacity style={s.msgBtn} onPress={() => navigation.navigate('MessagesTab', { screen:'Chat', params:{ other:item.sender, conversation:{ id:null, _userId:item.senderId }, rival } })}>
                            <Text style={s.msgBtnText}>{t.msgBtn}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
                            <Text style={s.cancelBtnText}>{t.cancelAdBtn}</Text>
                        </TouchableOpacity>
                    </View>
                ) : mySentReq === 'PENDING' ? (
                    <View style={s.waitingBox}><Text style={s.waitingText}>{t.waitingReq}</Text></View>
                ) : mySentReq === 'ACCEPTED' ? (
                    <View style={[s.waitingBox, { backgroundColor:'#16a34a20', borderColor:'#16a34a40' }]}>
                        <Text style={[s.waitingText, { color:'#4ade80' }]}>{t.requestAccepted || '✓ Kabul edildiniz!'}</Text>
                    </View>
                ) : item.flexibleSchedule ? (
                    <TouchableOpacity style={s.msgBtn} onPress={() => navigation.navigate('MessagesTab', { screen:'Chat', params:{ other:item.sender, conversation:{ id:null, _userId:item.senderId }, rival } })}>
                        <Text style={s.msgBtnText}>{t.msgAtBtn}</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={{ flexDirection:'row', gap:8 }}>
                        <TouchableOpacity style={[s.msgBtn, { flex:1 }]} onPress={() => navigation.navigate('MessagesTab', { screen:'Chat', params:{ other:item.sender, conversation:{ id:null, _userId:item.senderId }, rival } })}>
                            <Text style={s.msgBtnText}>{t.msgBtn}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.joinBtn, { backgroundColor: cfg.color, flex:2 }]} onPress={handleJoin}>
                            <Text style={s.joinBtnText}>{t.joinBtn}</Text>
                        </TouchableOpacity>
                    </View>
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
            handleJoin={() => { setDetailVisible(false); setTimeout(handleJoin, 300); }}
            handleCancel={() => { setDetailVisible(false); setTimeout(handleCancel, 300); }}
            handleRespondJoin={async (jrId, action) => { await handleRespondJoin(jrId, action); onRefresh(); }}
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

function UpcomingCard({ match, myId, onRefresh }) {
    const t = useT();
    const [showScore, setShowScore] = useState(false);
    const [myScore, setMyScore] = useState('');
    const [oppScore, setOppScore] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const isOwner = match.senderId === myId;

    const submitScore = async () => {
        if (myScore === '' || oppScore === '') { Alert.alert('', t.missingScore); return; }
        setSubmitting(true);
        try {
            const score = isOwner
                ? { senderScore: parseInt(myScore), opponentScore: parseInt(oppScore) }
                : { senderScore: parseInt(oppScore), opponentScore: parseInt(myScore) };
            await api.post(`/rivals/${match.id}/score`, score);
            Alert.alert('', t.scoreSent);
            setShowScore(false);
            onRefresh();
        } catch(e) { Alert.alert(t.error, e?.response?.data?.message || t.sendFailed); }
        finally { setSubmitting(false); }
    };

    const confirmScore = async () => {
        try {
            await api.post(`/rivals/${match.id}/confirm-score`, {});
            Alert.alert('', t.scoreConfirmed);
            onRefresh();
        } catch(e) { Alert.alert(t.error, e?.response?.data?.message || t.confirmFailed); }
    };

    const opponent = isOwner
        ? match.participants?.[0]
        : match.sender;

    return (
        <View style={[s.card, { borderColor:'#a855f740' }]}>
            <View style={s.cardHeader}>
                <Avatar name={isOwner ? match.sender?.username : opponent?.username} size={38} />
                <View style={{ flex:1 }}>
                    <Text style={s.cardName}>{opponent?.fullName || opponent?.username || 'Rakip'}</Text>
                    <Text style={s.cardSub}>
                        {match.matchDate ? new Date(match.matchDate).toLocaleDateString(t.dateLocale,{day:'numeric',month:'short',weekday:'short'}) : t.unknownDate}
                        {match.matchTime ? ` · ${match.matchTime}` : ''}
                    </Text>
                </View>
                {match.senderScore != null ? (
                    <View style={{ alignItems:'center' }}>
                        <Text style={s.scoreText}>
                            {isOwner ? match.senderScore : match.opponentScore} - {isOwner ? match.opponentScore : match.senderScore}
                        </Text>
                        {match.scoreConfirmed ? (
                            <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'700' }}>{t.confirmedScore}</Text>
                        ) : !isOwner && (
                            <TouchableOpacity style={s.confirmBtn} onPress={confirmScore}>
                                <Text style={s.confirmBtnText}>{t.confirmScoreBtn}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <TouchableOpacity style={s.scoreBtn} onPress={() => setShowScore(v=>!v)}>
                        <Text style={s.scoreBtnText}>{t.enterScore}</Text>
                    </TouchableOpacity>
                )}
            </View>

            {showScore && (
                <View style={s.scoreForm}>
                    <View style={s.scoreInputRow}>
                        <TextInput style={s.scoreInput} value={myScore} onChangeText={setMyScore}
                            keyboardType="numeric" placeholder={t.myScorePh} placeholderTextColor={colors.textMuted} maxLength={2} />
                        <Text style={{ color:colors.textSecondary, fontSize:16, fontWeight:'900' }}> - </Text>
                        <TextInput style={s.scoreInput} value={oppScore} onChangeText={setOppScore}
                            keyboardType="numeric" placeholder={t.oppScorePh} placeholderTextColor={colors.textMuted} maxLength={2} />
                    </View>
                    <TouchableOpacity style={[s.joinBtn, { marginTop:8 }, submitting && { opacity:0.6 }]} onPress={submitScore} disabled={submitting}>
                        <Text style={s.joinBtnText}>{submitting ? t.sending : t.sendScore}</Text>
                    </TouchableOpacity>
                </View>
            )}
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
        matchDate: null, matchTime: '', duration: '90',
        showDatePicker: false, showTimePicker: false, showDurationPicker: false,
        courtSearchText: '', courtResults: [], selectedCourt: null,
        showManualCourt: false,
        manualCourtName: '', manualCity: '', manualAddress: '',
        surface: '', venueType: '', courtReserved: false,
        message: '',
    };
    const [f, setF]               = useState(INIT);
    const [searching, setSearching] = useState(false);
    const [submitting, setSubmitting] = useState(false);
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
            });
            onCreated();
            onClose();
            reset();
        } catch(e) { Alert.alert(t.error, e?.response?.data?.message || t.sendFailed); }
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

                            {/* 1 - Mod */}
                            <Text style={s.fieldLabel}>{t.modLabel}</Text>
                            <View style={s.chipRow}>
                                {(sub === 'tennis' ? ['PRACTICE','COMPETITIVE'] : ['PRACTICE','COMPETITIVE','BOTH']).map(mode => {
                                    const isActive = sub === 'tennis'
                                        ? (f.matchMode === mode || f.matchMode === 'BOTH')
                                        : f.matchMode === mode;

                                    const handleModePress = () => {
                                        if (sub !== 'tennis' || !f.flexibleSchedule) {
                                            set('matchMode', mode);
                                            return;
                                        }
                                        // Tennis + flexible: toggle multi-select
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
                                            style={[s.chipBtn, isActive && {
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
                            {sub === 'tennis' && f.flexibleSchedule && (
                                <Text style={s.modeHint}>{t.multiSelectHint}</Text>
                            )}
                            {(f.matchMode === 'COMPETITIVE' || f.matchMode === 'BOTH') && (
                                <View style={s.eloWarning}>
                                    <Text style={s.eloWarningText}>{t.eloWarning}</Text>
                                </View>
                            )}

                            {/* 2 - Format (non-team) / Takım büyüklüğü (team) */}
                            {!isTeamSport ? (
                                <>
                                    <Text style={s.fieldLabel}>{t.formatLabel}</Text>
                                    <View style={s.chipRow}>
                                        {[{id:'SINGLE',label:t.singleFormat},{id:'DOUBLE',label:t.doubleFormat}].map(fmt => (
                                            <TouchableOpacity key={fmt.id} onPress={() => set('matchType', fmt.id)}
                                                style={[s.chipBtn, { flex:1 }, f.matchType===fmt.id && s.chipBtnActive]}>
                                                <Text style={[s.chipBtnText, f.matchType===fmt.id && s.chipBtnTextActive]}>{fmt.label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            ) : teamSizes.length > 0 && (
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

                            {/* 3 - Esnek Program */}
                            <View style={s.switchRow}>
                                <View style={{ flex:1 }}>
                                    <Text style={s.fieldLabel}>{t.flexLabel}</Text>
                                    <Text style={s.fieldHint}>{t.flexHint}</Text>
                                </View>
                                <Switch value={f.flexibleSchedule} onValueChange={v => setF(p => ({ ...p, flexibleSchedule: v, matchMode: !v && p.matchMode === 'BOTH' ? 'PRACTICE' : p.matchMode }))}
                                    trackColor={{ false: colors.border, true: '#eab308' }}
                                    thumbColor={f.flexibleSchedule ? '#fff' : colors.textMuted} />
                            </View>

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
                                    <OptionPickerModal
                                        visible={f.showTimePicker}
                                        title={t.selectTime}
                                        options={TIME_OPTS.filter(t => t.value)}
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
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:6 }}>
                                        <View style={s.chipRow}>
                                            {courtSurfaces.map(sf => (
                                                <TouchableOpacity key={sf.id} onPress={() => set('surface', sf.id)}
                                                    style={[s.chipBtn, f.surface===sf.id && s.chipBtnActive]}>
                                                    <Text style={[s.chipBtnText, f.surface===sf.id && s.chipBtnTextActive]}>{sf.emoji} {sf.label}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </ScrollView>

                                    {/* Mekan Tipi */}
                                    <Text style={[s.fieldLabel, { marginTop: -6 }]}>{t.venueLabel}</Text>
                                    <View style={s.chipRow}>
                                        {[{id:'OUTDOOR',label:t.outdoor},{id:'INDOOR',label:t.indoor}].map(vt => (
                                            <TouchableOpacity key={vt.id} onPress={() => set('venueType', vt.id)}
                                                style={[s.chipBtn, { flex:1 }, f.venueType===vt.id && s.chipBtnActive]}>
                                                <Text style={[s.chipBtnText, f.venueType===vt.id && s.chipBtnTextActive]}>{vt.label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Kort Rezerve */}
                                    <TouchableOpacity style={s.checkRow} onPress={() => set('courtReserved', !f.courtReserved)}>
                                        <View style={[s.checkbox, f.courtReserved && s.checkboxChecked]}>
                                            {f.courtReserved && <Text style={{ color:'#fff', fontSize:12 }}>✓</Text>}
                                        </View>
                                        <Text style={s.checkLabel}>{t.courtReservedLabel}</Text>
                                    </TouchableOpacity>

                                    {/* Açıklama */}
                                    <Text style={[s.fieldLabel, { marginTop:4 }]}>{t.messageFieldLabel}</Text>
                                    <TextInput style={[s.fieldInput, { height:80, textAlignVertical:'top' }]}
                                        value={f.message} onChangeText={v => set('message', v)}
                                        placeholder={t.messagePh}
                                        placeholderTextColor={colors.textMuted} multiline />
                                </>
                            )}

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

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function SubCategoryScreen({ route, navigation }) {
    const { category, sub } = route.params;
    const myId = useSelector(s => s.auth.user?.id);
    const t = useT();
    const cfg = getConfig(sub);
    const tabs = getTabs(sub);

    const [activeTab, setActiveTab] = useState('rivals');
    const [rivals, setRivals] = useState([]);
    const [playerWanted, setPlayerWanted] = useState([]);
    const [upcoming, setUpcoming] = useState([]);
    const [textPosts, setTextPosts] = useState([]);
    const [mediaPosts, setMediaPosts] = useState([]);
    const [mediaViewIdx, setMediaViewIdx] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [filterCity, setFilterCity] = useState('');
    const [filterDate, setFilterDate] = useState('all');
    const [locationLoading, setLocationLoading] = useState(false);

    const [showCreateRival, setShowCreateRival] = useState(false);
    const [showCreatePW, setShowCreatePW] = useState(false);
    const [profileUserId, setProfileUserId] = useState(null);

    const load = useCallback(async () => {
        try {
            const [rvRes, pwRes, postsRes, mediaRes] = await Promise.all([
                api.get(`/rivals?category=${category}&subCategory=${sub}`),
                api.get(`/rivals?category=${category}&subCategory=${sub}&matchType=PLAYER_WANTED`).catch(() => ({ data:[] })),
                api.get(`/posts?category=${category}&subCategory=${sub}&communityOnly=true&limit=30`).catch(() => ({ data:[] })),
                api.get(`/posts?category=${category}&subCategory=${sub}&mediaOnly=true&limit=50`).catch(() => ({ data:[] })),
            ]);

            const allRivals = rvRes.data;
            setRivals(allRivals.filter(r => r.matchType !== 'PLAYER_WANTED'));
            setPlayerWanted(pwRes.data.filter(p =>
                !Array.isArray(p.positions) ||
                (!p.positions.includes('REFEREE') && !p.positions.includes('REFEREE_OFFER'))
            ));

            // upcoming: matches where user is owner or participant and match is accepted
            const myUpcoming = allRivals.filter(r =>
                r.matchType !== 'PLAYER_WANTED' &&
                (r.senderId === myId || (Array.isArray(r.participants) && r.participants.some(p => p.id === myId))) &&
                Array.isArray(r.participants) && r.participants.length > 0
            );
            setUpcoming(myUpcoming);

            const allPosts = Array.isArray(postsRes.data) ? postsRes.data : [];
            setTextPosts(allPosts.filter(p => p.type === 'POST' && !p.imageUrl && !p.videoUrl));
            setMediaPosts(Array.isArray(mediaRes.data) ? mediaRes.data : []);
        } catch(e) { console.warn(e?.message); }
        finally { setLoading(false); setRefreshing(false); }
    }, [category, sub, myId]);

    useEffect(() => { load(); }, [load]);
    const onRefresh = () => { setRefreshing(true); load(); };

    const handleNearMe = async () => {
        setLocationLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') { Alert.alert(t.locationPermTitle, t.locationPermMsg); return; }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const [geo] = await Location.reverseGeocodeAsync(loc.coords);
            const city = geo.city || geo.subregion || geo.region || '';
            if (city) setFilterCity(city);
            else Alert.alert(t.error, t.cityNotFoundMsg);
        } catch { Alert.alert(t.error, t.locationFailedMsg); }
        finally { setLocationLoading(false); }
    };

    const today = new Date();
    const filteredRivals = rivals.filter(item => {
        if (filterCity.trim()) {
            const loc = (item.location || '').toLowerCase();
            const court = (item.courtName || '').toLowerCase();
            const addr = (item.courtAddress || '').toLowerCase();
            const q = filterCity.trim().toLowerCase();
            if (!loc.includes(q) && !court.includes(q) && !addr.includes(q)) return false;
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
    });

    return (
        <View style={[s.container, { paddingTop: Platform.OS==='ios' ? 56 : 40 }]}>
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
                            <TouchableOpacity style={[s.createBtn, { borderColor: cfg.color+'60' }]} onPress={() => setShowCreateRival(true)}>
                                <Text style={[s.createBtnText, { color: cfg.color }]}>{t.createAdBtn}</Text>
                            </TouchableOpacity>

                            {/* Filter Bar */}
                            <View style={s.filterBox}>
                                <View style={s.filterInputRow}>
                                    <TextInput
                                        style={s.filterInput}
                                        value={filterCity}
                                        onChangeText={setFilterCity}
                                        placeholder={`🔍 ${t.filterCityPh}`}
                                        placeholderTextColor={colors.textMuted}
                                    />
                                    <TouchableOpacity
                                        style={[s.nearBtn, locationLoading && { opacity: 0.6 }]}
                                        onPress={handleNearMe}
                                        disabled={locationLoading}
                                    >
                                        {locationLoading
                                            ? <ActivityIndicator size="small" color={cfg.color} />
                                            : <Text style={[s.nearBtnText, { color: cfg.color }]}>{t.nearMeBtn}</Text>
                                        }
                                    </TouchableOpacity>
                                </View>
                                <View style={s.dateChips}>
                                    {[['all',t.allFilter],['today',t.todayFilter],['week',t.weekFilter]].map(([val, label]) => (
                                        <TouchableOpacity
                                            key={val}
                                            style={[s.dateChip, filterDate === val && { backgroundColor: cfg.color+'25', borderColor: cfg.color }]}
                                            onPress={() => setFilterDate(val)}
                                        >
                                            <Text style={[s.dateChipText, filterDate === val && { color: cfg.color }]}>{label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    {(filterCity.trim() || filterDate !== 'all') && (
                                        <TouchableOpacity
                                            style={s.clearChip}
                                            onPress={() => { setFilterCity(''); setFilterDate('all'); }}
                                        >
                                            <Text style={s.clearChipText}>{t.clearFilter}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>

                            {/* Upcoming matches */}
                            {upcoming.length > 0 && (
                                <>
                                    <Text style={s.sectionTitle}>{t.upcomingMatchesTitle}</Text>
                                    {upcoming.map(m => (
                                        <UpcomingCard key={m.id} match={m} myId={myId} onRefresh={load} />
                                    ))}
                                    <Text style={s.sectionTitle}>{t.allListingsTitle}</Text>
                                </>
                            )}

                            {filteredRivals.length === 0
                                ? <EmptyState emoji="⚔️" text={rivals.length > 0 ? t.noFilterMatch : t.emptyRivals} />
                                : filteredRivals.map(item => (
                                    <RivalCard key={item.id} item={item} myId={myId} sub={sub} onRefresh={load} navigation={navigation} onUserPress={setProfileUserId} />
                                ))
                            }
                        </>
                    )}

                    {/* ── PLAYER WANTED ── */}
                    {activeTab === 'player_wanted' && (
                        <>
                            <TouchableOpacity style={[s.createBtn, { borderColor: cfg.color+'60' }]} onPress={() => setShowCreatePW(true)}>
                                <Text style={[s.createBtnText, { color: cfg.color }]}>{t.createPlayerWantedBtn}</Text>
                            </TouchableOpacity>
                            {playerWanted.length === 0
                                ? <EmptyState emoji="👤" text={t.emptyPlayerWanted} />
                                : playerWanted.map(item => (
                                    <RivalCard key={item.id} item={item} myId={myId} sub={sub} onRefresh={load} navigation={navigation} onUserPress={setProfileUserId} />
                                ))
                            }
                        </>
                    )}

                    {/* ── TOURNAMENTS ── */}
                    {activeTab === 'tournaments' && (
                        <EmptyState emoji="🏆" text={t.emptyTournaments} />
                    )}

                    {/* ── COACHES ── */}
                    {activeTab === 'coaches' && (
                        <EmptyState emoji="🎓" text={t.emptyCoaches} />
                    )}

                    {/* ── ARCHIVE ── */}
                    {activeTab === 'archive' && (
                        <EmptyState emoji="🗃️" text={t.emptyArchive} />
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

            <CreateRivalModal visible={showCreateRival} onClose={() => setShowCreateRival(false)} category={category} sub={sub} onCreated={load} />
            <CreatePlayerWantedModal visible={showCreatePW} onClose={() => setShowCreatePW(false)} category={category} sub={sub} onCreated={load} />
            <UserProfileModal visible={!!profileUserId} userId={profileUserId} onClose={() => setProfileUserId(null)} navigation={navigation} />

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
    tab:              { paddingHorizontal:14, paddingVertical:8, borderRadius:20, backgroundColor: colors.surface, borderWidth:1, borderColor: colors.border },
    tabText:          { color: colors.textSecondary, fontSize:12, fontWeight:'700' },
    tabTextActive:    { color:'#fff' },

    list:             { paddingHorizontal:16, gap:12, paddingBottom:60 },
    sectionTitle:     { color: colors.textSecondary, fontSize:12, fontWeight:'800', marginTop:4, marginBottom:4 },

    createBtn:        { backgroundColor: colors.surface, borderRadius:14, paddingVertical:14, alignItems:'center', borderWidth:1, borderStyle:'dashed' },
    createBtnText:    { fontWeight:'700', fontSize:14 },

    filterBox:        { backgroundColor: colors.surface, borderRadius:16, padding:12, borderWidth:1, borderColor: colors.border, gap:10 },
    filterInputRow:   { flexDirection:'row', gap:8, alignItems:'center' },
    filterInput:      { flex:1, backgroundColor: colors.surface2, color:'#fff', borderRadius:10, paddingHorizontal:12, paddingVertical:9, borderWidth:1, borderColor: colors.border, fontSize:13 },
    nearBtn:          { backgroundColor: colors.surface2, borderRadius:10, paddingHorizontal:12, paddingVertical:9, borderWidth:1, borderColor: colors.border, height:40, justifyContent:'center' },
    nearBtnText:      { fontSize:12, fontWeight:'700' },
    dateChips:        { flexDirection:'row', gap:8, flexWrap:'wrap' },
    dateChip:         { paddingHorizontal:12, paddingVertical:6, borderRadius:10, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border },
    dateChipText:     { color: colors.textSecondary, fontSize:12, fontWeight:'700' },
    clearChip:        { paddingHorizontal:12, paddingVertical:6, borderRadius:10, backgroundColor:'#dc262620', borderWidth:1, borderColor:'#dc262640' },
    clearChipText:    { color:'#f87171', fontSize:12, fontWeight:'700' },

    empty:            { alignItems:'center', paddingTop:60, paddingBottom:40 },
    emptyEmoji:       { fontSize:48, marginBottom:12 },
    emptyText:        { color: colors.textSecondary, fontSize:15, fontWeight:'600' },
    emptyBtn:         { marginTop:16, backgroundColor: colors.purple, borderRadius:12, paddingHorizontal:20, paddingVertical:10 },
    emptyBtnText:     { color:'#fff', fontWeight:'700' },

    card:             { backgroundColor: colors.surface, borderRadius:18, padding:14, borderWidth:1, borderColor: colors.border },
    cardHeader:       { flexDirection:'row', alignItems:'flex-start', gap:10, marginBottom:8 },
    avatar:           { justifyContent:'center', alignItems:'center', borderWidth:1 },
    avatarText:       { fontWeight:'800' },
    cardName:         { color:'#fff', fontWeight:'700', fontSize:14 },
    cardSub:          { color: colors.textMuted, fontSize:11 },
    ratingText:       { fontSize:11, fontWeight:'900' },

    modeBadge:        { borderRadius:8, paddingHorizontal:8, paddingVertical:3, borderWidth:1, alignSelf:'flex-start' },
    modeBadgeText:    { fontSize:10, fontWeight:'700' },
    joinedCount:      { color: colors.textMuted, fontSize:10, marginTop:2 },

    flexBanner:       { backgroundColor:'#eab30815', borderRadius:10, padding:10, marginBottom:8, borderWidth:1, borderColor:'#eab30840' },
    flexTitle:        { color:'#fbbf24', fontSize:11, fontWeight:'700', marginBottom:2 },
    flexDesc:         { color:'#fcd34d99', fontSize:10 },

    levelRow:         { flexDirection:'row', gap:8, marginBottom:8, flexWrap:'wrap' },
    levelBadge:       { backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:8, paddingVertical:3, color:'#d1d5db', fontSize:11, fontWeight:'700', borderWidth:1, borderColor: colors.border },
    levelDetail:      { backgroundColor:'#a855f720', borderRadius:8, paddingHorizontal:8, paddingVertical:3, color:'#c084fc', fontSize:11, fontWeight:'700', borderWidth:1, borderColor:'#a855f740' },

    cardMsg:          { color: colors.textSecondary, fontSize:13, marginBottom:8 },
    cardMeta:         { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:10 },
    metaItem:         { backgroundColor: colors.surface2, paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1, borderColor: colors.border },
    metaItemText:     { color: colors.text, fontSize:11, fontWeight:'600' },

    joinBtn:          { borderRadius:12, paddingVertical:12, alignItems:'center', backgroundColor: colors.purple },
    joinBtnText:      { color:'#fff', fontWeight:'800', fontSize:14 },
    msgBtn:           { backgroundColor:'#2563eb20', borderRadius:12, paddingVertical:10, alignItems:'center', borderWidth:1, borderColor:'#2563eb40', flex:1 },
    msgBtnText:       { color:'#60a5fa', fontWeight:'700', fontSize:13 },
    cancelBtn:        { backgroundColor:'#dc262620', borderRadius:12, paddingVertical:10, alignItems:'center', borderWidth:1, borderColor:'#dc262640', flex:1 },
    cancelBtnText:    { color:'#f87171', fontWeight:'700', fontSize:13 },
    waitingBox:       { backgroundColor: colors.surface2, borderRadius:12, paddingVertical:12, alignItems:'center', borderWidth:1, borderColor: colors.border },
    waitingText:      { color: colors.textMuted, fontSize:13, fontWeight:'600' },

    ownerActions:     { gap:8 },
    ownerBtnRow:      { flexDirection:'row', gap:8 },
    joinRequestsBox:  { backgroundColor: colors.surface2, borderRadius:12, padding:12, borderWidth:1, borderColor: colors.border },
    joinRequestsTitle:{ color:'#fff', fontSize:12, fontWeight:'700', marginBottom:8 },
    joinRequestRow:   { flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 },
    joinRequestName:  { flex:1, color: colors.textSecondary, fontSize:12 },
    acceptBtn:        { backgroundColor:'#16a34a', borderRadius:8, width:28, height:28, justifyContent:'center', alignItems:'center' },
    declineBtn:       { backgroundColor:'#dc2626', borderRadius:8, width:28, height:28, justifyContent:'center', alignItems:'center' },

    participantsRow:      { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:10 },
    participantChip:      { backgroundColor:'#16a34a15', borderRadius:8, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#16a34a40' },
    participantChipText:  { color:'#4ade80', fontSize:11, fontWeight:'700' },
    pendingBadge:         { backgroundColor:'#a855f715', borderRadius:8, paddingHorizontal:10, paddingVertical:5, borderWidth:1, borderColor:'#a855f740', marginBottom:8 },
    pendingBadgeText:     { color:'#c084fc', fontSize:12, fontWeight:'700' },

    scoreText:        { color:'#fff', fontSize:16, fontWeight:'900' },
    scoreBtn:         { backgroundColor:'#a855f720', borderRadius:10, paddingHorizontal:12, paddingVertical:6, borderWidth:1, borderColor:'#a855f750' },
    scoreBtnText:     { color:'#c084fc', fontSize:12, fontWeight:'700' },
    confirmBtn:       { backgroundColor:'#16a34a30', borderRadius:8, paddingHorizontal:10, paddingVertical:4, marginTop:4, borderWidth:1, borderColor:'#16a34a60' },
    confirmBtnText:   { color:'#4ade80', fontSize:11, fontWeight:'700' },
    scoreForm:        { marginTop:10 },
    scoreInputRow:    { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8 },
    scoreInput:       { backgroundColor: colors.surface2, color:'#fff', borderRadius:10, paddingHorizontal:12, paddingVertical:10, borderWidth:1, borderColor: colors.border, fontSize:18, fontWeight:'800', width:60, textAlign:'center' },

    modalOverlay:     { flex:1, backgroundColor:'#000000bb', justifyContent:'flex-end' },
    modalBox:         { backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40, maxHeight:'92%' },
    modalHeader:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
    modalTitle:       { color:'#fff', fontSize:18, fontWeight:'900' },
    modalClose:       { color: colors.textMuted, fontSize:22 },

    fieldLabel:       { color: colors.textSecondary, fontSize:12, fontWeight:'700', marginBottom:6 },
    fieldHint:        { color: colors.textMuted, fontSize:10, marginBottom:8 },
    fieldInput:       { backgroundColor: colors.surface2, color:'#fff', borderRadius:12, paddingHorizontal:14, paddingVertical:12, borderWidth:1, borderColor: colors.border, fontSize:14, marginBottom:14 },
    chipRow:          { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:14 },
    chipBtn:          { paddingHorizontal:14, paddingVertical:8, borderRadius:10, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border },
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

    triRow:           { flexDirection:'row', gap:8, marginBottom:16 },
    triBtn:           { flex:1, backgroundColor: colors.surface2, borderRadius:12, paddingVertical:12, paddingHorizontal:10, borderWidth:1, borderColor: colors.border, alignItems:'center' },
    triBtnFilled:     { borderColor: colors.purple+'80' },
    triLabel:         { color: colors.textMuted, fontSize:10, fontWeight:'700', marginBottom:4 },
    triValue:         { color:'#fff', fontSize:13, fontWeight:'800', textAlign:'center' },
    triPlaceholder:   { color: colors.textMuted, fontSize:18 },

    storyNavBtn:      { backgroundColor:'#ffffff20', borderRadius:12, paddingHorizontal:20, paddingVertical:10 },
});
