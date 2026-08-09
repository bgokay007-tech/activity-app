import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, TextInput, Switch, ScrollView } from 'react-native';
import colors from '../theme/colors';
import useT from '../hooks/useT';

export default function FriendFindingFilterModal({ visible, onClose, profile, onApply }) {
    const t = useT();
    const [ageMin, setAgeMin] = useState('');
    const [ageMax, setAgeMax] = useState('');
    const [maxDistanceKm, setMaxDistanceKm] = useState('50');
    const [genderPref, setGenderPref] = useState([]);
    const [seekingFilter, setSeekingFilter] = useState(null);

    useEffect(() => {
        if (visible && profile) {
            setAgeMin(profile.ageMin ? String(profile.ageMin) : '');
            setAgeMax(profile.ageMax ? String(profile.ageMax) : '');
            setMaxDistanceKm(profile.maxDistanceKm ? String(profile.maxDistanceKm) : '50');
            setGenderPref(Array.isArray(profile.genderPref) ? profile.genderPref : []);
            setSeekingFilter(profile.seekingFilter || null);
        }
    }, [visible, profile]);

    const toggleGender = (g) => {
        setGenderPref(prev => 
            prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
        );
    };

    const handleApply = () => {
        const payload = {
            ageMin: ageMin.trim() ? parseInt(ageMin, 10) : null,
            ageMax: ageMax.trim() ? parseInt(ageMax, 10) : null,
            maxDistanceKm: maxDistanceKm.trim() ? parseInt(maxDistanceKm, 10) : 50,
            genderPref,
            seekingFilter,
        };
        onApply(payload);
    };

    const genders = [
        { id: 'MALE', label: t.ffMale || 'Erkek' },
        { id: 'FEMALE', label: t.ffFemale || 'Kadın' },
        { id: 'OTHER', label: t.ffOther || 'Diğer' }
    ];

    // Anketteki "Ne arıyorsun" cevabı sadece karakter analizi (aiProfile) için — kimin
    // kime görüneceğini artık SADECE bu filtre belirliyor, seçilmezse (Fark etmez) herkes uygun.
    const seekingOptions = [
        { id: null, label: t.ffSeekingAny || 'Fark etmez' },
        { id: 'FRIENDS', label: t.ffSeekingFriends || 'Arkadaş' },
        { id: 'PARTNER', label: t.ffSeekingPartner || 'Sevgili' },
        { id: 'BOTH', label: t.ffSeekingBoth || 'İkisi de' },
    ];

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={s.overlay}>
                <View style={s.content}>
                    <View style={s.header}>
                        <Text style={s.title}>Filtreler</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={s.closeText}>Kapat</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={s.body}>
                        {/* Yaş Aralığı */}
                        <Text style={s.sectionTitle}>Yaş Aralığı</Text>
                        <View style={s.row}>
                            <TextInput 
                                style={[s.input, { flex: 1 }]}
                                placeholder="Min Yaş"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numeric"
                                value={ageMin}
                                onChangeText={setAgeMin}
                            />
                            <Text style={s.dash}>-</Text>
                            <TextInput 
                                style={[s.input, { flex: 1 }]}
                                placeholder="Maks Yaş"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numeric"
                                value={ageMax}
                                onChangeText={setAgeMax}
                            />
                        </View>

                        {/* Mesafe */}
                        <Text style={s.sectionTitle}>Maksimum Mesafe (km)</Text>
                        <TextInput 
                            style={s.input}
                            placeholder="Mesafe (örn: 50)"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="numeric"
                            value={maxDistanceKm}
                            onChangeText={setMaxDistanceKm}
                        />

                        {/* Ne Arıyorsun (görünürlüğü belirleyen filtre — anket sadece bilgi amaçlı) */}
                        <Text style={s.sectionTitle}>Ne Arıyorlar</Text>
                        <View style={s.genderRow}>
                            {seekingOptions.map(opt => {
                                const selected = seekingFilter === opt.id;
                                return (
                                    <TouchableOpacity
                                        key={String(opt.id)}
                                        style={[s.genderBtn, selected && s.genderBtnSelected]}
                                        onPress={() => setSeekingFilter(opt.id)}
                                    >
                                        <Text style={[s.genderText, selected && s.genderTextSelected]}>
                                            {opt.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Cinsiyet Tercihi */}
                        <Text style={s.sectionTitle}>Cinsiyet Tercihi (Boş = Hepsi)</Text>
                        <View style={s.genderRow}>
                            {genders.map(g => {
                                const selected = genderPref.includes(g.id);
                                return (
                                    <TouchableOpacity 
                                        key={g.id} 
                                        style={[s.genderBtn, selected && s.genderBtnSelected]}
                                        onPress={() => toggleGender(g.id)}
                                    >
                                        <Text style={[s.genderText, selected && s.genderTextSelected]}>
                                            {g.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ScrollView>

                    <TouchableOpacity style={s.applyBtn} onPress={handleApply}>
                        <Text style={s.applyBtnText}>Uygula</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    content: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 21, maxHeight: '80%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 21 },
    title: { color: '#fff', fontSize: 18, fontWeight: '800' },
    closeText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
    body: { marginBottom: 21 },
    sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 17 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    dash: { color: colors.textMuted, fontSize: 17 },
    input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13, color: '#fff', fontSize: 15 },
    genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    genderBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 15 },
    genderBtnSelected: { backgroundColor: '#d9770620', borderColor: '#d97706' },
    genderText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
    genderTextSelected: { color: '#d97706' },
    applyBtn: { backgroundColor: '#d97706', borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
    applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' }
});
