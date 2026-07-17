import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import api from '../../services/api';
import { onSocket } from '../../services/socket';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';

export default function FriendFindingHomeScreen({ navigation }) {
    const t = useT();
    const [profile, setProfile]       = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [index, setIndex]           = useState(0);
    const [loading, setLoading]       = useState(true);
    const [swiping, setSwiping]       = useState(false);
    const [locationReady, setLocationReady] = useState(false);

    const ensureLocation = async () => {
        try {
            const perm = await Location.requestForegroundPermissionsAsync();
            if (!perm.granted) { Alert.alert('', t.ffLocationRequired); return false; }
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            await api.post('/friend-finding/location', { lat: pos.coords.latitude, lng: pos.coords.longitude });
            return true;
        } catch {
            Alert.alert('', t.ffLocationFailed);
            return false;
        }
    };

    const loadCandidates = useCallback(async () => {
        setLoading(true);
        try {
            const { data: myProfile } = await api.get('/friend-finding/profile');
            setProfile(myProfile);
            if (!myProfile) { setLoading(false); return; }

            const ok = await ensureLocation();
            setLocationReady(ok);
            if (!ok) { setLoading(false); return; }

            const { data } = await api.get('/friend-finding/candidates');
            setCandidates(data || []);
            setIndex(0);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useFocusEffect(useCallback(() => { loadCandidates(); }, [loadCandidates]));

    useEffect(() => {
        const off = onSocket('friendMatchFound', () => {
            Alert.alert(t.ffMatchTitle, t.ffMatchDesc);
        });
        return off;
    }, [t]);

    const toggleActive = async () => {
        if (!profile) return;
        try {
            const { data } = await api.patch('/friend-finding/profile', { active: !profile.active });
            setProfile(data);
        } catch (e) { console.error(e); }
    };

    const current = candidates[index];

    const doSwipe = async (decision) => {
        if (!current || swiping) return;
        setSwiping(true);
        try {
            const { data } = await api.post('/friend-finding/swipe', { targetId: current.id, decision });
            if (data.matched) {
                Alert.alert(t.ffMatchTitle, t.ffMatchDescWith(current.fullName || current.username));
            }
        } catch (e) { console.error(e); }
        finally {
            setSwiping(false);
            setIndex(i => i + 1);
        }
    };

    return (
        <View style={s.container}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
                    <Text style={s.backText}>{t.back}</Text>
                </TouchableOpacity>
                <Text style={s.title}>{t.ffHomeTitle}</Text>
                <TouchableOpacity onPress={() => navigation.navigate('FriendFindingMatches')} style={s.matchesLink}>
                    <Text style={s.matchesLinkText}>{t.ffMatchesTab}</Text>
                </TouchableOpacity>
            </View>

            {profile && (
                <View style={s.activeRow}>
                    <Text style={s.activeLabel}>{t.ffActiveLabel}</Text>
                    <TouchableOpacity
                        onPress={toggleActive}
                        style={[s.toggleTrack, profile.active && s.toggleTrackOn]}
                        activeOpacity={0.8}
                    >
                        <View style={[s.toggleThumb, profile.active && s.toggleThumbOn]} />
                    </TouchableOpacity>
                </View>
            )}

            {loading ? (
                <ActivityIndicator color="#d97706" style={{ marginTop: 60 }} />
            ) : !profile ? (
                <View style={s.emptyBox}>
                    <Text style={s.emptyText}>{t.ffNoProfileText}</Text>
                </View>
            ) : !locationReady ? (
                <View style={s.emptyBox}>
                    <Text style={s.emptyText}>{t.ffLocationRequired}</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={loadCandidates}>
                        <Text style={s.retryBtnText}>{t.ffRetryBtn}</Text>
                    </TouchableOpacity>
                </View>
            ) : !current ? (
                <View style={s.emptyBox}>
                    <Text style={s.emptyEmoji}>🔍</Text>
                    <Text style={s.emptyText}>{t.ffNoMoreCandidates}</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={loadCandidates}>
                        <Text style={s.retryBtnText}>{t.ffRetryBtn}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView contentContainerStyle={s.deckArea}>
                    <View style={s.card}>
                        <View style={s.avatarPlaceholder}>
                            <Text style={s.avatarEmoji}>👤</Text>
                        </View>
                        <Text style={s.cardName}>{current.fullName || current.username}{current.age ? `, ${current.age}` : ''}</Text>
                        <Text style={s.cardMeta}>{[current.city, current.distanceKm != null ? t.ffDistanceAway(current.distanceKm) : null].filter(Boolean).join(' · ')}</Text>
                        {current.compatibility != null && (
                            <Text style={s.cardCompat}>{t.ffCompatibility(current.compatibility)}</Text>
                        )}
                        {current.sharedInterests?.length > 0 && (
                            <View style={s.tagRow}>
                                {current.sharedInterests.map(tag => (
                                    <View key={tag} style={s.tag}><Text style={s.tagText}>{tag}</Text></View>
                                ))}
                            </View>
                        )}
                    </View>

                    <View style={s.actionsRow}>
                        <TouchableOpacity style={[s.actionBtn, s.passBtn]} onPress={() => doSwipe('PASS')} disabled={swiping}>
                            <Text style={s.passBtnText}>✕ {t.ffPassBtn}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.actionBtn, s.likeBtn]} onPress={() => doSwipe('LIKE')} disabled={swiping}>
                            <Text style={s.likeBtnText}>♥ {t.ffLikeBtn}</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container:     { flex: 1, backgroundColor: colors.bg, paddingTop: 53 },
    header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, marginBottom: 8, gap: 3 },
    back:          {},
    backText:      { color: colors.purple, fontSize: 15, fontWeight: '700' },
    title:         { color: '#fff', fontSize: 18, fontWeight: '900', flex: 1, textAlign: 'center' },
    matchesLink:   {},
    matchesLinkText: { color: '#d97706', fontSize: 13, fontWeight: '700' },

    activeRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, marginBottom: 11 },
    activeLabel:   { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
    toggleTrack:   { width: 46, height: 26, borderRadius: 13, backgroundColor: colors.surface2, padding: 0, justifyContent: 'center' },
    toggleTrackOn: { backgroundColor: '#d97706' },
    toggleThumb:   { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textMuted },
    toggleThumbOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },

    emptyBox:      { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 27, gap: 3 },
    emptyEmoji:    { fontSize: 48, marginBottom: 8 },
    emptyText:     { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
    retryBtn:      { marginTop: 17, backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 21, paddingVertical: 9, borderWidth: 1, borderColor: colors.border },
    retryBtnText:  { color: '#fff', fontWeight: '700', fontSize: 13 },

    deckArea:      { paddingHorizontal: 17, paddingBottom: 37, alignItems: 'center' },
    card:          { width: '100%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 21, alignItems: 'center', marginTop: 8 },
    avatarPlaceholder: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
    avatarEmoji:   { fontSize: 44 },
    cardName:      { color: '#fff', fontSize: 19, fontWeight: '900' },
    cardMeta:      { color: colors.textMuted, fontSize: 13, marginTop: 4 },
    cardCompat:    { color: '#d97706', fontSize: 13, fontWeight: '800', marginTop: 8 },
    tagRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 13, justifyContent: 'center' },
    tag:           { backgroundColor: '#d9770615', borderColor: '#d9770650', borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
    tagText:       { color: '#d97706', fontSize: 11, fontWeight: '700' },

    actionsRow:    { flexDirection: 'row', gap: 11, marginTop: 21, width: '100%' },
    actionBtn:     { flex: 1, borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1 },
    passBtn:       { backgroundColor: colors.surface2, borderColor: colors.border },
    passBtnText:   { color: colors.textSecondary, fontWeight: '800', fontSize: 15 },
    likeBtn:       { backgroundColor: '#d9770620', borderColor: '#d97706' },
    likeBtnText:   { color: '#d97706', fontWeight: '800', fontSize: 15 },
});
