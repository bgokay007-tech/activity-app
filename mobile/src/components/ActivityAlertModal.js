import { useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, Modal, StyleSheet, Platform,
    ActivityIndicator, TextInput, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';
import api from '../services/api';
import useT from '../hooks/useT';

// Aktivite bildirim filtresi — kategori/dal/il-ilçe, yakınımdaki canlı konum, favori sanatçı.
// Bildirimler > Ayarlar ve (eski) Aktivite ekranı aynı bileşeni kullanır.
export default function ActivityAlertModal({ visible, onClose, categories = [], onSaved }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [cats, setCats] = useState([]);
    const [subs, setSubs] = useState([]);
    const [cities, setCities] = useState([]);
    const [cityInput, setCityInput] = useState('');
    const [useProximity, setUseProximity] = useState(false);
    const [radiusKm, setRadiusKm] = useState(25);
    const [artists, setArtists] = useState([]);
    const [artistInput, setArtistInput] = useState('');

    useEffect(() => {
        if (!visible) return;
        setLoading(true);
        api.get('/activity-alerts/me').then(({ data }) => {
            setEnabled(!!data.enabled);
            setCats(data.categories || []);
            setSubs(data.subCategories || []);
            setCities(data.cities || []);
            setUseProximity(!!data.useProximity);
            setRadiusKm(data.radiusKm || 25);
            setArtists(data.favoriteArtists || []);
        }).catch(() => {}).finally(() => setLoading(false));
    }, [visible]);

    const toggleCat = (key) => {
        setCats(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            if (!next.includes(key)) {
                const catSubs = (categories.find(c => c.key === key)?.subs || []).map(s => s.key);
                setSubs(p => p.filter(s => !catSubs.includes(s)));
            }
            return next;
        });
    };
    const toggleSub = (key) => setSubs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

    const addCity = () => {
        const v = cityInput.trim();
        if (v && !cities.some(c => c.toLowerCase() === v.toLowerCase())) setCities(prev => [...prev, v]);
        setCityInput('');
    };
    const removeCity = (c) => setCities(prev => prev.filter(x => x !== c));

    const addArtist = () => {
        const v = artistInput.trim();
        if (v && !artists.some(a => a.toLowerCase() === v.toLowerCase())) setArtists(prev => [...prev, v]);
        setArtistInput('');
    };
    const removeArtist = (a) => setArtists(prev => prev.filter(x => x !== a));

    const visibleSubs = (cats.length === 0 ? categories : categories.filter(c => cats.includes(c.key)))
        .flatMap(c => c.subs);

    const save = async () => {
        setSaving(true);
        try {
            await api.put('/activity-alerts/me', {
                enabled, categories: cats, subCategories: subs, cities,
                useProximity, radiusKm, favoriteArtists: artists,
            });
            onSaved?.(enabled);
            onClose();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actAlertSaveFailed);
        } finally { setSaving(false); }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={st.overlay}>
                <View style={[st.sheet, { height: '90%', paddingBottom: (Platform.OS === 'ios' ? 36 : 24) + insets.bottom }]}>
                    <View style={st.handle} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={st.title}>{t.actAlertTitle}</Text>
                        <TouchableOpacity onPress={() => setEnabled(v => !v)} style={[st.toggle, enabled && st.toggleActive]} activeOpacity={0.8}>
                            <View style={[st.toggleDot, enabled && st.toggleDotActive]} />
                        </TouchableOpacity>
                    </View>

                    {loading ? <ActivityIndicator color={colors.purple} style={{ marginVertical: 24 }} /> : (
                        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
                            <Text style={st.subLabel}>{t.actAlertCategory}</Text>
                            <View style={st.subGrid}>
                                {categories.map(cat => {
                                    const active = cats.includes(cat.key);
                                    return (
                                        <TouchableOpacity key={cat.key}
                                            style={[st.subChip, active && { backgroundColor: cat.color + '28', borderColor: cat.color }]}
                                            onPress={() => toggleCat(cat.key)} activeOpacity={0.8}>
                                            <Text style={st.subChipEmoji}>{cat.emoji}</Text>
                                            <Text style={[st.subChipText, active && { color: cat.color }]}>{cat.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={[st.subLabel, { marginTop: 14 }]}>{t.actAlertSub}</Text>
                            <View style={st.subGrid}>
                                {visibleSubs.map(sub => {
                                    const active = subs.includes(sub.key);
                                    return (
                                        <TouchableOpacity key={sub.key}
                                            style={[st.subChip, active && { backgroundColor: colors.purple + '28', borderColor: colors.purple }]}
                                            onPress={() => toggleSub(sub.key)} activeOpacity={0.8}>
                                            <Text style={st.subChipEmoji}>{sub.emoji}</Text>
                                            <Text style={[st.subChipText, active && { color: colors.purpleLight }]}>{sub.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={[st.subLabel, { marginTop: 14 }]}>{t.actAlertCityLabel}</Text>
                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                <TextInput
                                    style={[st.filterInput, { flex: 1 }]}
                                    value={cityInput} onChangeText={setCityInput}
                                    placeholder={t.actAlertCityPlaceholder} placeholderTextColor={colors.textMuted}
                                    onSubmitEditing={addCity} returnKeyType="done"
                                />
                                <TouchableOpacity onPress={addCity} style={st.addBtn} activeOpacity={0.8}>
                                    <Text style={st.addBtnText}>{t.actAlertAdd}</Text>
                                </TouchableOpacity>
                            </View>
                            {cities.length > 0 && (
                                <View style={[st.subGrid, { marginTop: 6 }]}>
                                    {cities.map(c => (
                                        <TouchableOpacity key={c} style={st.tagChip} onPress={() => removeCity(c)} activeOpacity={0.8}>
                                            <Text style={st.tagChipText}>📍 {c}  ✕</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}
                                onPress={() => setUseProximity(v => !v)} activeOpacity={0.8}
                            >
                                <Text style={st.subLabel}>{t.actAlertProximity}</Text>
                                <View style={[st.toggle, useProximity && st.toggleActive]}>
                                    <View style={[st.toggleDot, useProximity && st.toggleDotActive]} />
                                </View>
                            </TouchableOpacity>
                            {useProximity && (
                                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                    {[10, 25, 50, 100].map(r => (
                                        <TouchableOpacity key={r} onPress={() => setRadiusKm(r)}
                                            style={[st.hourChip, radiusKm === r && st.hourChipActive]} activeOpacity={0.8}>
                                            <Text style={[st.hourText, radiusKm === r && st.hourTextActive]}>{r} km</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            <Text style={[st.subLabel, { marginTop: 16 }]}>{t.actAlertArtistLabel}</Text>
                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                <TextInput
                                    style={[st.filterInput, { flex: 1 }]}
                                    value={artistInput} onChangeText={setArtistInput}
                                    placeholder={t.actAlertArtistPlaceholder} placeholderTextColor={colors.textMuted}
                                    onSubmitEditing={addArtist} returnKeyType="done"
                                />
                                <TouchableOpacity onPress={addArtist} style={st.addBtn} activeOpacity={0.8}>
                                    <Text style={st.addBtnText}>{t.actAlertAdd}</Text>
                                </TouchableOpacity>
                            </View>
                            {artists.length > 0 && (
                                <View style={[st.subGrid, { marginTop: 6 }]}>
                                    {artists.map(a => (
                                        <TouchableOpacity key={a} style={st.tagChip} onPress={() => removeArtist(a)} activeOpacity={0.8}>
                                            <Text style={st.tagChipText}>🎤 {a}  ✕</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    )}

                    <View style={st.btnRow}>
                        <TouchableOpacity style={st.clearBtn} onPress={onClose} activeOpacity={0.8}>
                            <Text style={st.clearBtnText}>{t.actAlertCancel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[st.applyBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} activeOpacity={0.8}>
                            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.applyBtnText}>{t.actAlertSave}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const st = StyleSheet.create({
    overlay:  { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    sheet:    { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%', flexDirection: 'column', gap: 10 },
    handle:   { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 6 },
    title:    { color: '#fff', fontSize: 17, fontWeight: '900' },
    subLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
    subGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
    subChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    subChipEmoji: { fontSize: 14 },
    subChipText:  { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
    filterInput: {
        backgroundColor: colors.surface2, borderRadius: 8,
        paddingHorizontal: 8, paddingVertical: 5, color: '#fff', fontSize: 12,
        borderWidth: 1, borderColor: colors.border,
    },
    toggle:          { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, padding: 2, justifyContent: 'center' },
    toggleActive:    { backgroundColor: colors.purple + '55', borderColor: colors.purple },
    toggleDot:       { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textMuted, alignSelf: 'flex-start' },
    toggleDotActive: { backgroundColor: colors.purple, alignSelf: 'flex-end' },
    hourChip:       { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    hourChipActive: { backgroundColor: colors.purple + '28', borderColor: colors.purple },
    hourText:       { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    hourTextActive: { color: colors.purpleLight },
    addBtn:     { backgroundColor: colors.purple, borderRadius: 8, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    addBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    tagChip:     { backgroundColor: colors.purple + '18', borderWidth: 1, borderColor: colors.purple + '50', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
    tagChipText: { color: colors.purpleLight || colors.purple, fontSize: 12, fontWeight: '700' },
    btnRow:      { flexDirection: 'row', gap: 10 },
    clearBtn:    { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    clearBtnText:{ color: colors.textSecondary, fontWeight: '700' },
    applyBtn:    { flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: colors.purple },
    applyBtnText:{ color: '#fff', fontWeight: '900', fontSize: 15 },
});
