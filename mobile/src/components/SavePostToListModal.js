import { useEffect, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
    ActivityIndicator, Alert,
} from 'react-native';
import api from '../services/api';
import colors from '../theme/colors';
import useT from '../hooks/useT';
import KeyboardSafeModal from './KeyboardSafeModal';

export const savedListName = (list, t) => (
    list?.kind === 'GENERAL'
        ? (t.sv_list_general || 'General')
        : (list?.name || t.sv_list_custom || 'List')
);

export default function SavePostToListModal({ visible, postId, onClose, onChanged }) {
    const t = useT();
    const [lists, setLists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);
    const [showCreate, setShowCreate] = useState(false);

    const reload = () => {
        if (!postId) return;
        setLoading(true);
        api.get('/saved/lists', { params: { postId } })
            .then(({ data }) => setLists(Array.isArray(data) ? data : []))
            .catch(() => setLists([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (!visible) {
            setNewName('');
            setShowCreate(false);
            return;
        }
        reload();
    }, [visible, postId]);

    const notify = (next) => {
        const saved = next.some(l => l.hasPost);
        onChanged?.(saved, next);
    };

    const toggle = async (list) => {
        if (!postId || busyId) return;
        setBusyId(list.id);
        try {
            if (list.hasPost) await api.delete(`/saved/lists/${list.id}/items/${postId}`);
            else await api.post(`/saved/lists/${list.id}/items`, { postId });
            // GENERAL kapandıysa hepsi gider; yeniden çek.
            const { data } = await api.get('/saved/lists', { params: { postId } });
            const next = Array.isArray(data) ? data : [];
            setLists(next);
            notify(next);
        } catch (e) {
            Alert.alert(t.error || 'Error', e?.response?.data?.message || t.actionFailed || 'Failed');
        } finally { setBusyId(null); }
    };

    const create = async () => {
        const name = newName.trim();
        if (!name || creating || !postId) return;
        setCreating(true);
        try {
            const { data } = await api.post('/saved/lists', { name });
            await api.post(`/saved/lists/${data.id}/items`, { postId });
            const { data: all } = await api.get('/saved/lists', { params: { postId } });
            const next = Array.isArray(all) ? all : [];
            setLists(next);
            setNewName('');
            setShowCreate(false);
            notify(next);
        } catch (e) {
            Alert.alert(t.error || 'Error', e?.response?.data?.message || t.actionFailed || 'Failed');
        } finally { setCreating(false); }
    };

    return (
        <KeyboardSafeModal visible={visible} onClose={onClose}>
            <View style={s.head}>
                <Text style={s.title}>🔖 {t.sv_save_to_list || 'Save'}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={s.close}>✕</Text>
                </TouchableOpacity>
            </View>
            <Text style={s.hint}>{t.sv_save_hint || ''}</Text>
            {loading ? <ActivityIndicator color={colors.purple} style={{ marginVertical: 24 }} /> : (
                <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
                    {lists.map(l => (
                        <TouchableOpacity key={l.id} style={s.row} onPress={() => toggle(l)} activeOpacity={0.8}>
                            <Text style={s.icon}>{l.kind === 'GENERAL' ? '📥' : '📁'}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={s.name} numberOfLines={1}>{savedListName(l, t)}</Text>
                                <Text style={s.count}>
                                    {(t.sv_list_count || ((n) => `${n}`))(l.itemCount || 0)}
                                </Text>
                            </View>
                            {busyId === l.id
                                ? <ActivityIndicator color={colors.purple} />
                                : (
                                    <View style={[s.check, l.hasPost && s.checkOn]}>
                                        {l.hasPost ? <Text style={s.checkMark}>✓</Text> : null}
                                    </View>
                                )}
                        </TouchableOpacity>
                    ))}

                    {!showCreate ? (
                        <TouchableOpacity style={s.createOpen} onPress={() => setShowCreate(true)} activeOpacity={0.85}>
                            <Text style={s.createOpenText}>＋ {t.sv_create_list_q || 'Create a list?'}</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={{ marginTop: 12 }}>
                            <Text style={s.label}>{t.sv_new_list || 'New list'}</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TextInput
                                    style={s.input}
                                    value={newName}
                                    onChangeText={setNewName}
                                    placeholder={t.sv_new_list_ph || 'List name'}
                                    placeholderTextColor={colors.textMuted}
                                    maxLength={60}
                                    onSubmitEditing={create}
                                    returnKeyType="done"
                                    autoFocus
                                />
                                <TouchableOpacity
                                    style={[s.addBtn, { opacity: newName.trim() ? 1 : 0.5 }]}
                                    onPress={create}
                                    disabled={!newName.trim() || creating}
                                >
                                    {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.addText}>+</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </ScrollView>
            )}
            <TouchableOpacity style={s.done} onPress={onClose}>
                <Text style={s.doneText}>{t.done || t.sv_done || 'Done'}</Text>
            </TouchableOpacity>
        </KeyboardSafeModal>
    );
}

const s = StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    title: { color: colors.text, fontSize: 17, fontWeight: '900' },
    close: { color: colors.textMuted, fontSize: 20, fontWeight: '800', padding: 4 },
    hint: { color: colors.textMuted, fontSize: 12, marginBottom: 10, lineHeight: 17 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    icon: { fontSize: 22 },
    name: { color: colors.text, fontSize: 15, fontWeight: '800' },
    count: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
    check: {
        width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    checkOn: { backgroundColor: colors.purple, borderColor: colors.purple },
    checkMark: { color: '#fff', fontWeight: '900' },
    createOpen: {
        marginTop: 14, paddingVertical: 12, borderRadius: 12,
        backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    },
    createOpenText: { color: colors.purple, fontWeight: '800', fontSize: 14 },
    label: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 6 },
    input: {
        flex: 1, backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1,
        borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14,
    },
    addBtn: {
        width: 46, borderRadius: 12, backgroundColor: colors.purple,
        alignItems: 'center', justifyContent: 'center',
    },
    addText: { color: '#fff', fontSize: 22, fontWeight: '900' },
    done: {
        marginTop: 14, backgroundColor: colors.purple, borderRadius: 12,
        paddingVertical: 12, alignItems: 'center',
    },
    doneText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
