import { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    Modal, FlatList, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';
import api from '../services/api';

// Mangal Partisi ayrı bir tür olmaktan çıkarıldı — kullanıcı isteğiyle artık
// İçecek/Yiyecek türünden serbest isimle eklenebiliyor (ör. "Mangal Partisi").
// REFEREE, sadece `referee` prop'u verilen çağıranlarda (CreateRivalModal) gösterilir —
// diğer kullanımlarda (ör. turnuva, ArtistsTab) bu sekme hiç görünmez.
const EXTRA_TYPES = [
    { key: 'REFEREE',    label: 'Hakem' },
    { key: 'FOOD_DRINK', label: 'İçecek/Yiyecek' },
    { key: 'DJ',         label: 'DJ' },
    { key: 'ARTIST',     label: 'Sanatçı' },
    { key: 'EQUIPMENT',  label: 'Ekipman' },
    { key: 'OTHER',      label: 'Diğer' },
];

function ArtistPickerModal({ visible, onClose, onSelect }) {
    const insets = useSafeAreaInsets();
    const [query, setQuery] = useState('');
    const [artists, setArtists] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = () => {
        setLoading(true);
        api.get('/artists').then(({ data }) => setArtists(Array.isArray(data) ? data : []))
            .catch(() => setArtists([]))
            .finally(() => setLoading(false));
    };

    const q = query.trim().toLowerCase();
    const results = q
        ? artists.filter(a =>
            (a.stageName || '').toLowerCase().includes(q) ||
            (a.user?.username || '').toLowerCase().includes(q) ||
            (a.genres || '').toLowerCase().includes(q))
        : artists;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={load} android_keyboardInputMode="adjustNothing">
            <View style={s.overlay}>
                <KeyboardAvoidingView behavior="padding" style={{ flex:1, justifyContent:'flex-end' }}>
                    <View style={s.sheet}>
                        <View style={s.header}>
                            <Text style={s.title}>Sanatçı Seç</Text>
                            <TouchableOpacity onPress={onClose}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
                        </View>
                        <TextInput
                            style={s.search}
                            value={query}
                            onChangeText={setQuery}
                            placeholder="İsim veya tarz ara..."
                            placeholderTextColor={colors.textMuted}
                            autoFocus
                        />
                        {loading && <ActivityIndicator color={colors.purple} style={{ marginVertical: 12 }} />}
                        <FlatList
                            data={results}
                            keyExtractor={item => item.id}
                            keyboardShouldPersistTaps="handled"
                            style={{ maxHeight: 360 }}
                            contentContainerStyle={{ paddingBottom: Math.max(12, insets.bottom + 10) }}
                            ListEmptyComponent={!loading ? <Text style={s.emptyText}>Sanatçı bulunamadı</Text> : null}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={s.artistRow} onPress={() => { onSelect(item); onClose(); }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.artistName}>{item.stageName || item.user?.username}</Text>
                                        <Text style={s.artistMeta}>
                                            {item.genres ? item.genres : ''}
                                            {item.city ? `${item.genres ? ' · ' : ''}${item.city}` : ''}
                                        </Text>
                                    </View>
                                    {item.pricePerEvent != null && (
                                        <Text style={s.artistPrice}>{item.pricePerEvent}₺</Text>
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

// Hakem — kendi davet/onay/bildirim akışı olduğu için genel {type,name,price,included}
// listesine katılmıyor; `referee` prop'unun tuttuğu state/handler'lar doğrudan
// CreateRivalModal'daki gerçek hakem sistemine bağlı (bkz. ExtraServicesEditor).
function RefereeTypeContent({ referee }) {
    return (
        <View>
            <View style={{ flexDirection:'row', alignItems:'stretch', gap:4, marginBottom:8 }}>
                <TouchableOpacity
                    onPress={referee.onToggleRequested}
                    style={{ flex:0.6, height:34, alignItems:'center', justifyContent:'center', borderRadius:8, backgroundColor: referee.requested ? '#f59e0b20' : colors.surface, borderWidth:1, borderColor: referee.requested ? '#f59e0b70' : colors.border }}
                >
                    <Text style={{ color: referee.requested ? '#f59e0b' : colors.textMuted, fontSize:12, fontWeight:'800' }} numberOfLines={1}>
                        {referee.requested ? '✓ Hakem İsteniyor' : 'Hakem Talep Et'}
                    </Text>
                </TouchableOpacity>
                <View style={{ flex:1, position:'relative' }}>
                    <TextInput
                        style={[st.input, { marginBottom:0, height:34 }]}
                        value={referee.name}
                        onChangeText={referee.onChangeName}
                        placeholder="Hakem"
                        placeholderTextColor={colors.textMuted}
                    />
                    {referee.suggestions.length > 0 && (
                        <View style={{ position:'absolute', top:36, left:0, right:0, backgroundColor: colors.surface, borderRadius:8, borderWidth:1, borderColor: colors.border, zIndex:20, elevation:6 }}>
                            {referee.suggestions.map(u => (
                                <TouchableOpacity key={u.id} onPress={() => referee.onPickSuggestion(u)}
                                    style={{ flexDirection:'row', alignItems:'center', gap:6, padding:7, borderBottomWidth:1, borderBottomColor: colors.border }}>
                                    <Text style={{ color: colors.text, fontSize:12, fontWeight:'600' }} numberOfLines={1}>{u.fullName || u.username}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>
            </View>
            {referee.requested && (
                <>
                    <TouchableOpacity onPress={referee.onInvitePress} style={[st.artistPickBtn, referee.invites.length > 0 && { borderColor: '#f59e0b70' }]}>
                        <Text style={[st.artistPickText, referee.invites.length > 0 && { color: '#f59e0b' }]}>
                            {referee.invites.length > 0 ? `Hakem Davet Et (${referee.invites.length})` : 'Hakem Davet Et'}
                        </Text>
                    </TouchableOpacity>
                    {referee.invites.length > 0 && (
                        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                            {referee.invites.map(inv => (
                                <TouchableOpacity key={inv.user.id} onPress={() => referee.onRemoveInvite(inv.user.id)}
                                    style={{ flexDirection:'row', alignItems:'center', gap:3, backgroundColor:'#f59e0b15', borderRadius:10, borderWidth:1, borderColor:'#f59e0b40', paddingHorizontal:7, paddingVertical:4 }}>
                                    <Text style={{ color: colors.text, fontSize:11, fontWeight:'700' }} numberOfLines={1}>
                                        {inv.user.fullName || inv.user.username}{inv.price ? ` · ${inv.price}₺` : ''}
                                    </Text>
                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>✕</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                    <Text style={st.label}>ÜCRET</Text>
                    <View style={{ flexDirection:'row', gap:6, marginBottom:8 }}>
                        <TouchableOpacity onPress={() => referee.onSetFeeIncluded(true)} style={[st.priceChip, referee.feeIncluded && st.priceChipActive]}>
                            <Text style={[st.priceChipText, referee.feeIncluded && st.priceChipTextActive]}>Fiyata Dahil</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => referee.onSetFeeIncluded(false)} style={[st.priceChip, !referee.feeIncluded && st.priceChipActive]}>
                            <Text style={[st.priceChipText, !referee.feeIncluded && st.priceChipTextActive]}>Ekstra Ücret</Text>
                        </TouchableOpacity>
                    </View>
                    {!referee.feeIncluded && (
                        <TextInput
                            style={st.input}
                            value={referee.payment}
                            onChangeText={referee.onChangePayment}
                            placeholder="+ Ücret (₺)"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="numeric"
                        />
                    )}
                </>
            )}
        </View>
    );
}

function AddServiceForm({ onAdd, referee }) {
    const [type, setType] = useState(referee ? 'REFEREE' : 'DJ');
    const [name, setName] = useState('');
    const [priceMode, setPriceMode] = useState('EXTRA'); // 'EXTRA' | 'INCLUDED'
    const [price, setPrice] = useState('');
    const [artist, setArtist] = useState(null);
    const [showArtistPicker, setShowArtistPicker] = useState(false);

    const visibleTypes = referee ? EXTRA_TYPES : EXTRA_TYPES.filter(t => t.key !== 'REFEREE');

    const confirm = () => {
        const finalName = type === 'ARTIST' ? (artist?.stageName || artist?.user?.username) : (name.trim() || EXTRA_TYPES.find(t => t.key === type)?.label);
        if (!finalName) return;
        const included = priceMode === 'INCLUDED';
        let p = 0;
        if (!included) {
            p = parseInt(price);
            if (!Number.isFinite(p) || p <= 0) return;
        }
        onAdd({
            id: `${Date.now()}`,
            type, name: finalName, price: p, included,
            ...(type === 'ARTIST' && artist ? { artistListingId: artist.id } : {}),
        });
    };

    return (
        <View style={st.form}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {visibleTypes.map(t => (
                    <TouchableOpacity key={t.key}
                        onPress={() => { setType(t.key); setName(''); setArtist(null); }}
                        style={[st.chip, type === t.key && st.chipActive]}>
                        <Text style={[st.chipText, type === t.key && st.chipTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {type === 'REFEREE' ? (
                <RefereeTypeContent referee={referee} />
            ) : (
                <>
                    {type === 'ARTIST' ? (
                        <TouchableOpacity onPress={() => setShowArtistPicker(true)} style={st.artistPickBtn}>
                            <Text style={st.artistPickText}>
                                {artist ? `🎤 ${artist.stageName || artist.user?.username}` : 'Sanatçı Seç'}
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <TextInput
                            style={st.input}
                            value={name}
                            onChangeText={setName}
                            placeholder={type === 'OTHER' ? 'Hizmet adı' : EXTRA_TYPES.find(t => t.key === type)?.label}
                            placeholderTextColor={colors.textMuted}
                        />
                    )}

                    <Text style={st.label}>FİYAT</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                        <TouchableOpacity onPress={() => setPriceMode('INCLUDED')} style={[st.priceChip, priceMode === 'INCLUDED' && st.priceChipActive]}>
                            <Text style={[st.priceChipText, priceMode === 'INCLUDED' && st.priceChipTextActive]}>Fiyata Dahil</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setPriceMode('EXTRA')} style={[st.priceChip, priceMode === 'EXTRA' && st.priceChipActive]}>
                            <Text style={[st.priceChipText, priceMode === 'EXTRA' && st.priceChipTextActive]}>Ekstra Ücret</Text>
                        </TouchableOpacity>
                    </View>
                    {priceMode === 'EXTRA' && (
                        <TextInput
                            style={st.input}
                            value={price}
                            onChangeText={v => setPrice(v.replace(/[^0-9]/g, ''))}
                            placeholder="+ Fiyat (₺)"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="numeric"
                        />
                    )}
                </>
            )}

            {type !== 'REFEREE' && (
                <TouchableOpacity onPress={confirm} style={[st.confirmBtn, { marginTop: 4 }]}>
                    <Text style={st.confirmBtnText}>Ekle</Text>
                </TouchableOpacity>
            )}

            <ArtistPickerModal
                visible={showArtistPicker}
                onClose={() => setShowArtistPicker(false)}
                onSelect={setArtist}
            />
        </View>
    );
}

// Maç/turnuva ilanına eklenen ekstra hizmetler (DJ, sanatçı, mangal partisi vb.)
// services: [{id, type, name, price, included, artistListingId?}]
export default function ExtraServicesEditor({ services = [], onChange, referee = null }) {
    const insets = useSafeAreaInsets();
    const [showModal, setShowModal] = useState(false);

    const remove = (id) => onChange(services.filter(s => s.id !== id));
    const addService = (entry) => onChange([...services, entry]);

    return (
        <View style={st.triBtn}>
            <TouchableOpacity onPress={() => setShowModal(true)} style={{ alignItems: 'center' }}>
                <Text style={st.triLabel}>HİZMETLER</Text>
                <Text style={[st.triValue, services.length === 0 && st.triPlaceholder]}>
                    {services.length > 0 ? `🎉 ${services.length}` : '—'}
                </Text>
            </TouchableOpacity>

            <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)} android_keyboardInputMode="adjustNothing">
                <View style={s.overlay}>
                    <KeyboardAvoidingView behavior="padding" style={{ flex:1, justifyContent:'flex-end' }}>
                        <View style={s.sheet}>
                            <View style={s.header}>
                                <Text style={s.title}>Ekstra Hizmetler</Text>
                                <TouchableOpacity onPress={() => setShowModal(false)}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
                            </View>
                            <ScrollView
                                style={{ maxHeight: 460 }}
                                contentContainerStyle={{ padding: 13, paddingBottom: Math.max(20, insets.bottom + 16) }}
                                keyboardShouldPersistTaps="handled"
                            >
                                {services.map(sv => (
                                    <View key={sv.id} style={st.row}>
                                        <Text style={st.rowText}>
                                            {EXTRA_TYPES.find(t => t.key === sv.type)?.label || sv.type} — {sv.name}
                                        </Text>
                                        <Text style={sv.included ? st.rowIncluded : st.rowPrice}>
                                            {sv.included ? 'Dahil' : `+${sv.price}₺`}
                                        </Text>
                                        <TouchableOpacity onPress={() => remove(sv.id)} style={{ padding: 4 }}>
                                            <Text style={{ color: '#f87171', fontSize: 14 }}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                <AddServiceForm onAdd={addService} referee={referee} />
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </View>
    );
}

const st = StyleSheet.create({
    triBtn: { flex: 0, backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    triLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 2 },
    triValue: { color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center' },
    triPlaceholder: { color: colors.textMuted },

    label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 },
    row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6, gap: 8 },
    rowText: { flex: 1, color: colors.text, fontSize: 12 },
    rowPrice: { color: colors.purpleLight, fontSize: 12, fontWeight: '700' },
    rowIncluded: { color: '#4ade80', fontSize: 12, fontWeight: '700' },
    addBtn: { borderWidth: 1, borderColor: colors.purple + '60', borderRadius: 8, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.purple + '10', marginTop: 4 },
    addBtnText: { color: colors.purpleLight, fontSize: 12, fontWeight: '700' },
    form: { backgroundColor: colors.surface2, borderRadius: 10, padding: 10, marginTop: 4 },
    chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.purple + '25', borderColor: colors.purple },
    chipText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    chipTextActive: { color: colors.purpleLight },
    priceChip: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    priceChipActive: { backgroundColor: '#22c55e20', borderColor: '#22c55e70' },
    priceChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    priceChipTextActive: { color: '#4ade80' },
    input: { backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, marginBottom: 8 },
    artistPickBtn: { backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 10, marginBottom: 8 },
    artistPickText: { color: colors.text, fontSize: 13 },
    confirmBtn: { backgroundColor: colors.purple, borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
    confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    cancelBtn: { backgroundColor: colors.surface, borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    cancelBtnText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
});

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
    closeBtn: { color: colors.textMuted, fontSize: 20 },
    search: { margin: 12, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7, color: colors.text, fontSize: 15 },
    artistRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border + '40' },
    artistName: { color: colors.text, fontSize: 14, fontWeight: '700' },
    artistMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    artistPrice: { color: colors.purpleLight, fontSize: 13, fontWeight: '700' },
    emptyText: { color: colors.textMuted, textAlign: 'center', paddingVertical: 16 },
});
