import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, TextInput, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import TravelRouteCard from '../../components/TravelRouteCard';
import { travelListName, travelListIcon } from '../../components/TravelSaveToListModal';
import { travelStyles as ts } from './TravelExploreHomeScreen';

const ACCENT = '#0ea5e9';

export default function TravelListScreen({ navigation, route }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const { listId } = route.params || {};
    const [list, setList] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState('');

    const load = useCallback(async () => {
        try {
            const { data } = await api.get(`/travel/lists/${listId}`);
            setList(data);
            setName(data.name || '');
        } catch { setList(null); }
        finally { setLoading(false); }
    }, [listId]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const removeItem = (r) => {
        Alert.alert('', t.tvRemoveFromListQ(r.title), [
            { text: t.tvCancel, style: 'cancel' },
            {
                text: t.yes, style: 'destructive', onPress: async () => {
                    try {
                        await api.delete(`/travel/lists/${listId}/items/${r.id}`);
                        setList(prev => ({ ...prev, routes: prev.routes.filter(x => x.id !== r.id) }));
                    } catch (e) { Alert.alert(t.error, e?.response?.data?.message || t.actionFailed); }
                },
            },
        ]);
    };

    const saveName = async () => {
        if (!name.trim()) return;
        try {
            await api.patch(`/travel/lists/${listId}`, { name: name.trim() });
            setList(prev => ({ ...prev, name: name.trim() }));
            setEditing(false);
        } catch (e) { Alert.alert(t.error, e?.response?.data?.message || t.actionFailed); }
    };

    const deleteList = () => {
        Alert.alert('', t.tvDeleteListQ, [
            { text: t.tvCancel, style: 'cancel' },
            {
                text: t.yes, style: 'destructive', onPress: async () => {
                    try { await api.delete(`/travel/lists/${listId}`); navigation.goBack(); }
                    catch (e) { Alert.alert(t.error, e?.response?.data?.message || t.actionFailed); }
                },
            },
        ]);
    };

    if (loading) return <View style={s.center}><ActivityIndicator color={ACCENT} /></View>;
    if (!list) return (
        <View style={s.center}>
            <Text style={{ color: colors.textMuted }}>{t.actionFailed}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}><Text style={[ts.backText, { marginTop: 12 }]}>{t.back}</Text></TouchableOpacity>
        </View>
    );

    const custom = list.kind === 'CUSTOM';

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: Math.max(insets.top, 12) + 6 }}>
            <View style={ts.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Text style={ts.backText}>{t.back}</Text></TouchableOpacity>
                <Text style={ts.title} numberOfLines={1}>{travelListIcon(list)} {travelListName(list, t)}</Text>
                {custom ? (
                    <TouchableOpacity onPress={deleteList}><Text style={{ color: colors.red, fontSize: 18 }}>🗑</Text></TouchableOpacity>
                ) : <View style={{ width: 30 }} />}
            </View>
            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 60 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={ACCENT} />}
            >
                {custom ? (editing ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                        <TextInput style={[ts.input, { flex: 1 }]} value={name} onChangeText={setName} maxLength={60} autoFocus onSubmitEditing={saveName} />
                        <TouchableOpacity style={s.saveBtn} onPress={saveName}><Text style={s.saveText}>✓</Text></TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity onPress={() => setEditing(true)}><Text style={s.link}>✏️ {t.tvRenameList}</Text></TouchableOpacity>
                )) : null}
                <Text style={s.count}>{t.tvListCount(list.routes.length)}</Text>
                {list.routes.length === 0 ? <Text style={s.empty}>{t.tvListEmpty}</Text> : list.routes.map(r => (
                    <TravelRouteCard
                        key={r.id}
                        route={r}
                        onPress={() => navigation.navigate('TravelRouteDetail', { routeId: r.id })}
                        onRemove={() => removeItem(r)}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    center:   { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    link:     { color: ACCENT, fontWeight: '800', fontSize: 14, paddingVertical: 6 },
    count:    { color: colors.textMuted, fontSize: 12, marginBottom: 10, marginTop: 4 },
    empty:    { color: colors.textMuted, textAlign: 'center', marginTop: 30, fontSize: 14, lineHeight: 20 },
    saveBtn:  { width: 48, borderRadius: 12, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
    saveText: { color: '#fff', fontSize: 20, fontWeight: '900' },
});
