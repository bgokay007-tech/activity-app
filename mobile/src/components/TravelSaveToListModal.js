import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import api from '../services/api';
import colors from '../theme/colors';
import useT from '../hooks/useT';
import KeyboardSafeModal from './KeyboardSafeModal';

const ACCENT = '#0ea5e9';
const LIST_ICONS = { COMPLETED: '✅', WISHLIST: '🧭', FAVORITES: '❤️', CUSTOM: '📁' };

// Varsayılan listelerin adı sunucuda tutulmuyor — dil değişince ad da değişsin.
export const travelListName = (list, t) => (list.kind === 'CUSTOM' ? list.name : t[`tvList${list.kind}`]);
export const travelListIcon = (list) => LIST_ICONS[list.kind] || LIST_ICONS.CUSTOM;

export default function TravelSaveToListModal({ visible, routeId, onClose, onChanged }) {
    const t = useT();
    const [lists, setLists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setLoading(true);
        api.get('/travel/lists', { params: { routeId } })
            .then(({ data }) => setLists(Array.isArray(data) ? data : []))
            .catch(() => setLists([]))
            .finally(() => setLoading(false));
    }, [visible, routeId]);

    const toggle = async (list) => {
        if (busyId) return;
        setBusyId(list.id);
        try {
            if (list.hasRoute) await api.delete(`/travel/lists/${list.id}/items/${routeId}`);
            else await api.post(`/travel/lists/${list.id}/items`, { routeId });
            const next = lists.map(l => (l.id === list.id
                ? { ...l, hasRoute: !l.hasRoute, itemCount: l.itemCount + (l.hasRoute ? -1 : 1) }
                : l));
            setLists(next);
            onChanged?.(next);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setBusyId(null); }
    };

    const create = async () => {
        const name = newName.trim();
        if (!name || creating) return;
        setCreating(true);
        try {
            const { data } = await api.post('/travel/lists', { name });
            await api.post(`/travel/lists/${data.id}/items`, { routeId });
            const next = [...lists, { ...data, itemCount: 1, hasRoute: true }];
            setLists(next);
            setNewName('');
            onChanged?.(next);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setCreating(false); }
    };

    return (
        <KeyboardSafeModal visible={visible} onClose={onClose}>
            <View style={s.head}>
                <Text style={s.title}>🔖 {t.tvSaveToList}</Text>
                <TouchableOpacity onPress={onClose}><Text style={s.close}>✕</Text></TouchableOpacity>
            </View>
            {loading ? <ActivityIndicator color={ACCENT} style={{ marginVertical: 24 }} /> : (
                <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                    {lists.map(l => (
                        <TouchableOpacity key={l.id} style={s.row} onPress={() => toggle(l)} activeOpacity={0.8}>
                            <Text style={s.icon}>{travelListIcon(l)}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={s.name} numberOfLines={1}>{travelListName(l, t)}</Text>
                                <Text style={s.count}>{t.tvListCount(l.itemCount)}</Text>
                            </View>
                            {busyId === l.id ? <ActivityIndicator color={ACCENT} />
                                : <View style={[s.check, l.hasRoute && s.checkOn]}>{l.hasRoute ? <Text style={s.checkMark}>✓</Text> : null}</View>}
                        </TouchableOpacity>
                    ))}
                    <Text style={s.label}>{t.tvNewList}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                            style={s.input}
                            value={newName}
                            onChangeText={setNewName}
                            placeholder={t.tvNewListPh}
                            placeholderTextColor={colors.textMuted}
                            maxLength={60}
                            onSubmitEditing={create}
                            returnKeyType="done"
                        />
                        <TouchableOpacity style={[s.addBtn, { opacity: newName.trim() ? 1 : 0.5 }]} onPress={create} disabled={!newName.trim() || creating}>
                            {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.addText}>+</Text>}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            )}
        </KeyboardSafeModal>
    );
}

const s = StyleSheet.create({
    head:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    title:    { color: colors.text, fontSize: 17, fontWeight: '900' },
    close:    { color: colors.textMuted, fontSize: 20, fontWeight: '800', padding: 4 },
    row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
    icon:     { fontSize: 22 },
    name:     { color: colors.text, fontSize: 15, fontWeight: '800' },
    count:    { color: colors.textMuted, fontSize: 12, marginTop: 1 },
    check:    { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkOn:  { backgroundColor: ACCENT, borderColor: ACCENT },
    checkMark:{ color: '#fff', fontWeight: '900' },
    label:    { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 6 },
    input:    { flex: 1, backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14 },
    addBtn:   { width: 46, borderRadius: 12, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
    addText:  { color: '#fff', fontSize: 22, fontWeight: '900' },
});
