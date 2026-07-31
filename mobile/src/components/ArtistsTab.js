import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    Modal, ScrollView, ActivityIndicator, Alert, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';
import api from '../services/api';

const ARTIST_TYPES = [
    { key: 'DJ',            label: 'DJ' },
    { key: 'BAND',          label: 'Grup / Orkestra' },
    { key: 'SOLO_MUSICIAN', label: 'Solo Müzisyen' },
    { key: 'DANCER',        label: 'Dansçı' },
    { key: 'OTHER',         label: 'Diğer' },
];
const TYPE_LABEL = Object.fromEntries(ARTIST_TYPES.map(t => [t.key, t.label]));

// Müzik alt dalındaki "Sanatçılar" sekmesi — sanatçılar kendi etkinlik/performans/
// yeteneklerini tanıtır, maç/turnuva ilanına "ekstra hizmet" olarak sanatçı eklemek
// isteyenler de buradan seçer (bkz. ExtraServicesEditor).
export default function ArtistsTab({ myId, navigation }) {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [myListing, setMyListing] = useState(null);
    const [showForm, setShowForm] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            api.get('/artists').then(r => r.data).catch(() => []),
            api.get('/artists/mine').then(r => r.data).catch(() => null),
        ]).then(([all, mine]) => {
            setListings(Array.isArray(all) ? all : []);
            setMyListing(mine || null);
        }).finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const contact = (artist) => {
        if (!artist.user?.id) return;
        navigation.navigate('MessagesTab', {
            screen: 'Chat',
            params: { other: { id: artist.user.id, username: artist.user.username, fullName: artist.user.fullName, avatar: artist.user.avatar } },
        });
    };

    const openLink = (url) => {
        if (!url) return;
        const full = /^https?:\/\//.test(url) ? url : `https://${url}`;
        Linking.openURL(full).catch(() => {});
    };

    return (
        <View>
            <TouchableOpacity style={s.myProfileBtn} onPress={() => setShowForm(true)}>
                <Text style={s.myProfileBtnText}>{myListing ? '✎ Profilimi Düzenle' : '+ Sanatçı Profilimi Oluştur'}</Text>
            </TouchableOpacity>

            {loading ? (
                <ActivityIndicator color={colors.purple} style={{ marginTop: 24 }} />
            ) : listings.length === 0 ? (
                <Text style={s.emptyText}>Henüz sanatçı profili yok</Text>
            ) : (
                listings.map(a => {
                    const isMine = a.user?.id === myId;
                    return (
                        <View key={a.id} style={s.card}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.cardName}>{a.stageName || a.user?.username}</Text>
                                    <Text style={s.cardType}>{TYPE_LABEL[a.artistType] || a.artistType}{a.city ? ` · ${a.city}` : ''}</Text>
                                </View>
                                {a.pricePerEvent != null && <Text style={s.cardPrice}>{a.pricePerEvent}₺</Text>}
                            </View>
                            {a.genres ? <Text style={s.cardGenres}>{a.genres}</Text> : null}
                            {a.description ? <Text style={s.cardDesc}>{a.description}</Text> : null}
                            {(a.portfolioUrl1 || a.portfolioUrl2) && (
                                <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                                    {a.portfolioUrl1 && (
                                        <TouchableOpacity onPress={() => openLink(a.portfolioUrl1)}>
                                            <Text style={s.link}>🔗 Portfolyo</Text>
                                        </TouchableOpacity>
                                    )}
                                    {a.portfolioUrl2 && (
                                        <TouchableOpacity onPress={() => openLink(a.portfolioUrl2)}>
                                            <Text style={s.link}>🔗 Bağlantı</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                            {isMine ? (
                                <View style={s.mineBadge}><Text style={s.mineBadgeText}>Bu senin profilin</Text></View>
                            ) : (
                                <TouchableOpacity style={s.contactBtn} onPress={() => contact(a)}>
                                    <Text style={s.contactBtnText}>💬 İletişime Geç</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                })
            )}

            <ArtistFormModal
                visible={showForm}
                listing={myListing}
                onClose={() => setShowForm(false)}
                onSaved={() => { setShowForm(false); load(); }}
            />
        </View>
    );
}

function ArtistFormModal({ visible, listing, onClose, onSaved }) {
    const insets = useSafeAreaInsets();
    const [artistType, setArtistType] = useState('DJ');
    const [stageName, setStageName] = useState('');
    const [genres, setGenres] = useState('');
    const [description, setDescription] = useState('');
    const [pricePerEvent, setPricePerEvent] = useState('');
    const [portfolioUrl1, setPortfolioUrl1] = useState('');
    const [portfolioUrl2, setPortfolioUrl2] = useState('');
    const [city, setCity] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setArtistType(listing?.artistType || 'DJ');
        setStageName(listing?.stageName || '');
        setGenres(listing?.genres || '');
        setDescription(listing?.description || '');
        setPricePerEvent(listing?.pricePerEvent != null ? String(listing.pricePerEvent) : '');
        setPortfolioUrl1(listing?.portfolioUrl1 || '');
        setPortfolioUrl2(listing?.portfolioUrl2 || '');
        setCity(listing?.city || '');
    }, [visible, listing]);

    const save = async () => {
        setSaving(true);
        try {
            await api.post('/artists/mine', { artistType, stageName, genres, description, pricePerEvent, portfolioUrl1, portfolioUrl2, city });
            onSaved();
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi'); }
        finally { setSaving(false); }
    };

    const remove = () => {
        Alert.alert('Profili Kaldır', 'Sanatçı profilini kaldırmak istediğine emin misin?', [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Kaldır', style: 'destructive', onPress: async () => {
                setSaving(true);
                try { await api.delete('/artists/mine'); onSaved(); }
                catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Kaldırılamadı'); }
                finally { setSaving(false); }
            } },
        ]);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={s.sheet}>
                        <View style={s.header}>
                            <Text style={s.title}>{listing ? 'Sanatçı Profilimi Düzenle' : 'Sanatçı Profili Oluştur'}</Text>
                            <TouchableOpacity onPress={onClose}><Text style={s.closeBtn}>✕</Text></TouchableOpacity>
                        </View>
                        <ScrollView contentContainerStyle={{ padding: 13, paddingBottom: Math.max(20, insets.bottom + 16) }} keyboardShouldPersistTaps="handled">
                            <Text style={s.label}>TÜR</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                {ARTIST_TYPES.map(t => (
                                    <TouchableOpacity key={t.key} onPress={() => setArtistType(t.key)}
                                        style={[s.chip, artistType === t.key && s.chipActive]}>
                                        <Text style={[s.chipText, artistType === t.key && s.chipTextActive]}>{t.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TextInput style={s.input} value={stageName} onChangeText={setStageName} placeholder="Sahne adı" placeholderTextColor={colors.textMuted} />
                            <TextInput style={s.input} value={genres} onChangeText={setGenres} placeholder="Tarz (ör. Pop, Rock, Elektronik)" placeholderTextColor={colors.textMuted} />
                            <TextInput style={[s.input, { height: 80, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription}
                                placeholder="Kendini/etkinliklerini/yeteneklerini tanıt..." placeholderTextColor={colors.textMuted} multiline />
                            <TextInput style={s.input} value={pricePerEvent} onChangeText={v => setPricePerEvent(v.replace(/[^0-9]/g, ''))}
                                placeholder="Etkinlik başı ücret (₺, isteğe bağlı)" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                            <TextInput style={s.input} value={city} onChangeText={setCity} placeholder="Şehir" placeholderTextColor={colors.textMuted} />
                            <TextInput style={s.input} value={portfolioUrl1} onChangeText={setPortfolioUrl1} placeholder="Instagram / YouTube linki" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
                            <TextInput style={s.input} value={portfolioUrl2} onChangeText={setPortfolioUrl2} placeholder="İkinci bağlantı (isteğe bağlı)" placeholderTextColor={colors.textMuted} autoCapitalize="none" />

                            <TouchableOpacity onPress={save} disabled={saving} style={[s.saveBtn, saving && { opacity: 0.6 }]}>
                                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Kaydet</Text>}
                            </TouchableOpacity>
                            {listing && (
                                <TouchableOpacity onPress={remove} disabled={saving} style={s.removeBtn}>
                                    <Text style={s.removeBtnText}>Profili Kaldır</Text>
                                </TouchableOpacity>
                            )}
                            <View style={{ height: 20 }} />
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    myProfileBtn: { borderWidth: 1, borderColor: colors.purple + '60', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.purple + '12', marginBottom: 12 },
    myProfileBtnText: { color: colors.purpleLight, fontWeight: '700', fontSize: 13 },
    emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 24, fontSize: 13 },
    card: { backgroundColor: colors.surface2, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
    cardName: { color: colors.text, fontSize: 15, fontWeight: '800' },
    cardType: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    cardPrice: { color: colors.purpleLight, fontSize: 14, fontWeight: '800' },
    cardGenres: { color: '#a78bfa', fontSize: 12, marginTop: 4 },
    cardDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
    link: { color: '#60a5fa', fontSize: 12, fontWeight: '700' },
    mineBadge: { alignSelf: 'flex-start', backgroundColor: colors.purple + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 8 },
    mineBadgeText: { color: colors.purpleLight, fontSize: 11, fontWeight: '700' },
    contactBtn: { alignSelf: 'flex-start', backgroundColor: '#22c55e18', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8, borderWidth: 1, borderColor: '#22c55e40' },
    contactBtnText: { color: '#4ade80', fontSize: 12, fontWeight: '700' },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
    closeBtn: { color: colors.textMuted, fontSize: 20 },
    label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 },
    chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.purple + '25', borderColor: colors.purple },
    chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: colors.purpleLight },
    input: { backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, marginBottom: 9 },
    saveBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    removeBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
    removeBtnText: { color: '#f87171', fontWeight: '700', fontSize: 13 },
});
