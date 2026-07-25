import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import colors from '../../theme/colors';

function Avatar({ user, size = 40 }) {
    return (
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>
                {user?.username?.[0]?.toUpperCase() || '?'}
            </Text>
        </View>
    );
}

export default function BlockedUsersScreen({ navigation }) {
    const [blocked, setBlocked] = useState([]);
    const [loading, setLoading] = useState(true);
    const [unblockingId, setUnblockingId] = useState(null);

    const load = useCallback(() => {
        api.get('/friends/blocked')
            .then(({ data }) => setBlocked(Array.isArray(data) ? data : []))
            .catch(() => setBlocked([]))
            .finally(() => setLoading(false));
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const unblock = (user) => {
        Alert.alert('Engeli Kaldır', `${user.fullName || user.username} kullanıcısının engelini kaldırmak istiyor musunuz?`, [
            { text: 'Vazgeç', style: 'cancel' },
            {
                text: 'Engeli Kaldır', style: 'destructive', onPress: async () => {
                    setUnblockingId(user.id);
                    try {
                        await api.delete(`/friends/block/${user.id}`);
                        setBlocked(prev => prev.filter(u => u.id !== user.id));
                    } catch (e) {
                        Alert.alert('', e?.response?.data?.message || 'İşlem başarısız oldu.');
                    } finally {
                        setUnblockingId(null);
                    }
                },
            },
        ]);
    };

    return (
        <View style={styles.root}>
            <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.title}>🚫 Engellenenler</Text>
            </View>

            {loading ? (
                <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />
            ) : blocked.length === 0 ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyEmoji}>🚫</Text>
                    <Text style={styles.emptyText}>Engellediğiniz kimse yok.</Text>
                </View>
            ) : (
                <FlatList
                    data={blocked}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingVertical: 8 }}
                    renderItem={({ item }) => (
                        <View style={styles.row}>
                            <Avatar user={item} />
                            <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={styles.name}>{item.fullName || item.username}</Text>
                                <Text style={styles.username}>@{item.username}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => unblock(item)}
                                disabled={unblockingId === item.id}
                                style={styles.unblockBtn}>
                                <Text style={styles.unblockBtnText}>{unblockingId === item.id ? '…' : 'Engeli Kaldır'}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: colors.textSecondary, fontSize: 26, fontWeight: '300' },
    title: { color: '#fff', fontSize: 17, fontWeight: '900' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border + '50' },
    avatar: { backgroundColor: colors.purple, justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#fff', fontWeight: '800' },
    name: { color: '#fff', fontSize: 14, fontWeight: '700' },
    username: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
    unblockBtn: { backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
    unblockBtnText: { color: '#f87171', fontSize: 12, fontWeight: '700' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
    emptyEmoji: { fontSize: 48, marginBottom: 10 },
    emptyText: { color: colors.textMuted, fontSize: 13 },
});
