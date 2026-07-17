import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';

export default function FriendFindingMatchesScreen({ navigation }) {
    const t = useT();
    const myUser = useSelector(s => s.auth.user);
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        api.get('/friend-finding/matches')
            .then(({ data }) => setMatches(data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const openChat = async (user) => {
        try {
            const { data: conv } = await api.get(`/messages/conversation/${user.id}`);
            const enriched = { ...conv, other: conv.user1Id === myUser?.id ? conv.user2 : conv.user1 };
            navigation.navigate('MessagesTab', { screen: 'Chat', params: { conversation: enriched, other: enriched.other } });
        } catch {
            Alert.alert('', t.actionFailed);
        }
    };

    return (
        <View style={s.container}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
                    <Text style={s.backText}>{t.back}</Text>
                </TouchableOpacity>
                <Text style={s.title}>{t.ffMatchesTab}</Text>
            </View>

            {loading ? (
                <ActivityIndicator color="#d97706" style={{ marginTop: 60 }} />
            ) : matches.length === 0 ? (
                <View style={s.emptyBox}>
                    <Text style={s.emptyEmoji}>💌</Text>
                    <Text style={s.emptyText}>{t.ffNoMatchesYet}</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={s.list}>
                    {matches.map(m => (
                        <TouchableOpacity key={m.id} style={s.row} onPress={() => openChat(m.user)}>
                            <View style={s.avatarPlaceholder}><Text style={s.avatarEmoji}>👤</Text></View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.rowName}>{m.user.fullName || m.user.username}</Text>
                                <Text style={s.rowMeta}>@{m.user.username}</Text>
                            </View>
                            <Text style={s.chatArrow}>💬</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container:   { flex: 1, backgroundColor: colors.bg, paddingTop: 53 },
    header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, marginBottom: 17, gap: 3 },
    back:        {},
    backText:    { color: colors.purple, fontSize: 15, fontWeight: '700' },
    title:       { color: '#fff', fontSize: 18, fontWeight: '900' },

    emptyBox:    { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 3 },
    emptyEmoji:  { fontSize: 48, marginBottom: 8 },
    emptyText:   { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: 3 },

    list:        { paddingHorizontal: 17, paddingBottom: 37, gap: 3 },
    row:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 11, gap: 11, borderWidth: 1, borderColor: colors.border, marginBottom: 3 },
    avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    avatarEmoji: { fontSize: 22 },
    rowName:     { color: '#fff', fontSize: 15, fontWeight: '800' },
    rowMeta:     { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    chatArrow:   { fontSize: 20 },
});
