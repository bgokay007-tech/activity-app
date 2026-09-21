import { useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, Modal, StyleSheet, Platform,
    ActivityIndicator, Linking, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import colors from '../theme/colors';
import api from '../services/api';
import useT from '../hooks/useT';
import { setUser } from '../store/slices/authSlice';
import ExtraNotifyChannelModal from './ExtraNotifyChannelModal';
import ActivityAlertModal from './ActivityAlertModal';

// Bildirimler ekranı > Ayarlar — ek kanal, arkadaş ilanı, aktivite bildirimleri hub'ı.
export default function NotificationSettingsModal({ visible, onClose, categories = [] }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const dispatch = useDispatch();
    const user = useSelector(s => s.auth.user);
    const [channelOpen, setChannelOpen] = useState(false);
    const [activityOpen, setActivityOpen] = useState(false);
    const [savingFriend, setSavingFriend] = useState(false);
    const [savingChannel, setSavingChannel] = useState(false);
    const [linkingTelegram, setLinkingTelegram] = useState(false);
    const [friendOn, setFriendOn] = useState(user?.notifyFriendListings !== false);
    const [activityOn, setActivityOn] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setFriendOn(user?.notifyFriendListings !== false);
        api.get('/activity-alerts/me')
            .then(({ data }) => setActivityOn(!!data.enabled))
            .catch(() => {});
        // Telegram bağlama durumu tazele
        api.get('/users/me').then(({ data }) => {
            dispatch(setUser({ ...user, ...data }));
            if (data.notifyFriendListings != null) setFriendOn(!!data.notifyFriendListings);
        }).catch(() => {});
    }, [visible]);

    const toggleFriend = async () => {
        const next = !friendOn;
        setFriendOn(next);
        setSavingFriend(true);
        try {
            const { data } = await api.patch('/users/me/notify-friend-listings', { enabled: next });
            dispatch(setUser({ ...user, notifyFriendListings: data.notifyFriendListings }));
        } catch (e) {
            setFriendOn(!next);
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.actionFailed);
        } finally { setSavingFriend(false); }
    };

    const openChannel = async () => {
        setChannelOpen(true);
        try {
            const { data } = await api.get('/users/me');
            dispatch(setUser({ ...user, ...data }));
        } catch { /* ignore */ }
    };

    const saveNotifyChannel = async (channel, phone, email) => {
        setSavingChannel(true);
        try {
            const { data } = await api.patch('/users/me/notify-channel', { channel, phone, email });
            dispatch(setUser({ ...user, ...data }));
            setChannelOpen(false);
        } catch (e) { Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.actionFailed); }
        setSavingChannel(false);
    };

    const linkTelegram = async () => {
        setLinkingTelegram(true);
        try {
            const { data } = await api.post('/telegram/link-token');
            if (!data.botConfigured || !data.deepLink) {
                Alert.alert(t.info || 'Bilgi', t.extraNotifyTelegramNotReady);
            } else {
                Linking.openURL(data.deepLink);
            }
        } catch (e) { Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.actionFailed); }
        setLinkingTelegram(false);
    };

    const unlinkTelegram = async () => {
        setLinkingTelegram(true);
        try {
            await api.post('/telegram/unlink');
            dispatch(setUser({ ...user, telegramLinked: false }));
        } catch (e) { Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.actionFailed); }
        setLinkingTelegram(false);
    };

    return (
        <>
            <Modal visible={visible && !channelOpen && !activityOpen} transparent animationType="slide" onRequestClose={onClose}>
                <View style={st.overlay}>
                    <View style={[st.sheet, { paddingBottom: (Platform.OS === 'ios' ? 28 : 18) + insets.bottom }]}>
                        <View style={st.handle} />
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={st.title}>{t.notifSettingsTitle}</Text>
                            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Text style={{ color: colors.textMuted, fontSize: 22, fontWeight: '300' }}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <TouchableOpacity style={st.row} onPress={openChannel} activeOpacity={0.7}>
                                <View style={{ flex: 1 }}>
                                    <Text style={st.rowTitle}>{t.extraNotifyLabel}</Text>
                                    <Text style={st.rowSub} numberOfLines={1}>
                                        {user?.extraNotifyChannel ? t[`extraNotify_${user.extraNotifyChannel}`] : t.extraNotifyOff}
                                    </Text>
                                </View>
                                <Text style={st.chevron}>›</Text>
                            </TouchableOpacity>

                            <View style={st.row}>
                                <View style={{ flex: 1, paddingRight: 10 }}>
                                    <Text style={st.rowTitle}>{t.notifFriendListingsLabel}</Text>
                                    <Text style={st.rowSub}>{t.notifFriendListingsDesc}</Text>
                                </View>
                                <TouchableOpacity
                                    onPress={toggleFriend}
                                    disabled={savingFriend}
                                    style={[st.toggle, friendOn && st.toggleActive]}
                                    activeOpacity={0.8}
                                >
                                    {savingFriend
                                        ? <ActivityIndicator size="small" color={colors.purple} />
                                        : <View style={[st.toggleDot, friendOn && st.toggleDotActive]} />}
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity style={st.row} onPress={() => setActivityOpen(true)} activeOpacity={0.7}>
                                <View style={{ flex: 1 }}>
                                    <Text style={st.rowTitle}>{t.actAlertTitle}</Text>
                                    <Text style={st.rowSub} numberOfLines={2}>
                                        {activityOn ? t.notifActivityOnHint : t.notifActivityOffHint}
                                    </Text>
                                </View>
                                <Text style={st.chevron}>›</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <ExtraNotifyChannelModal
                visible={channelOpen}
                onClose={() => setChannelOpen(false)}
                t={t}
                channel={user?.extraNotifyChannel || null}
                phone={user?.extraNotifyPhone || ''}
                email={user?.extraNotifyEmail || ''}
                accountPhone={user?.accountPhone || user?.phone || ''}
                accountEmail={user?.accountEmail || user?.email || ''}
                telegramLinked={!!user?.telegramLinked}
                onLinkTelegram={linkTelegram}
                onUnlinkTelegram={unlinkTelegram}
                linkingTelegram={linkingTelegram}
                onSave={saveNotifyChannel}
                saving={savingChannel}
            />

            <ActivityAlertModal
                visible={activityOpen}
                onClose={() => setActivityOpen(false)}
                categories={categories}
                onSaved={(en) => setActivityOn(!!en)}
            />
        </>
    );
}

const st = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: 18, paddingTop: 12, maxHeight: '70%',
    },
    handle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
    title: { color: '#fff', fontSize: 18, fontWeight: '900' },
    row: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: colors.border + '60', gap: 8,
    },
    rowTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
    rowSub: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
    chevron: { color: colors.textMuted, fontSize: 22, fontWeight: '300' },
    toggle: {
        width: 44, height: 26, borderRadius: 13, backgroundColor: colors.surface2,
        borderWidth: 1, borderColor: colors.border, padding: 2, justifyContent: 'center', alignItems: 'center',
    },
    toggleActive: { backgroundColor: colors.purple + '55', borderColor: colors.purple },
    toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textMuted, alignSelf: 'flex-start' },
    toggleDotActive: { backgroundColor: colors.purple, alignSelf: 'flex-end' },
});
