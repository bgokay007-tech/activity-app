import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView, TextInput,
    StyleSheet, StatusBar, Platform, Linking, Modal,
    ActivityIndicator, Alert,
} from 'react-native';
import colors from '../../theme/colors';
import api from '../../services/api';

const DAYS_TR = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const SLOT_LABEL = { FULL_HOUR: 'Tam Saatler', HALF_HOUR: 'Buçuklu Saatler', NINETY_MIN: '90 Dakika', FLEXIBLE: 'Serbest', VAR_DURATION: 'Esnek Saat' };
const SLOT_SHORT = { FULL_HOUR: 'Tam Saat', HALF_HOUR: 'Buçuklu', NINETY_MIN: '90 dk', FLEXIBLE: 'Esnek', VAR_DURATION: 'Esnek' };
const VALID_TYPES = ['FULL_HOUR', 'HALF_HOUR', 'NINETY_MIN', 'VAR_DURATION', 'FLEXIBLE'];
function courtSlotLabels(venue) {
    const courts = venue.courts || [];
    if (courts.length === 0) return SLOT_LABEL[venue.slotType] || venue.slotType;
    const venueBase = venue.slotType === 'VAR_DURATION' ? 'FULL_HOUR' : (venue.slotType || 'FULL_HOUR');
    const perCourt = courts.map(c => ({
        name: c.name,
        type: (VALID_TYPES.includes(c.slotType) ? c.slotType : null) || venueBase,
    }));
    const unique = [...new Set(perCourt.map(c => c.type))];
    if (unique.length === 1) return SLOT_LABEL[unique[0]] || unique[0];
    return perCourt.map(c => `${c.name}: ${SLOT_SHORT[c.type] || c.type}`).join('\n');
}

function StarRow({ value, onChange, size = 28 }) {
    return (
        <View style={{ flexDirection: 'row', gap: 6 }}>
            {[1,2,3,4,5].map(n => (
                <TouchableOpacity key={n} onPress={() => onChange?.(n)} activeOpacity={0.7}>
                    <Text style={{ fontSize: size, color: n <= value ? '#fbbf24' : '#374151' }}>★</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

function StarsDisplay({ value, count, size = 14 }) {
    if (!value) return null;
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {[1,2,3,4,5].map(n => (
                <Text key={n} style={{ fontSize: size, color: n <= Math.round(value) ? '#fbbf24' : '#374151' }}>★</Text>
            ))}
            <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: '800' }}>{value}</Text>
            {count != null && <Text style={{ color: '#6b7280', fontSize: 11 }}>({count})</Text>}
        </View>
    );
}

function ReviewModal({ visible, venue, myReviews, onClose, onSaved }) {
    const courts = venue?.courts || [];
    const [venueRating, setVenueRating]   = useState(myReviews?.venue?.rating || 0);
    const [venueComment, setVenueComment] = useState(myReviews?.venue?.comment || '');
    const [courtRatings, setCourtRatings] = useState(() => {
        const m = {};
        courts.forEach(c => {
            const ex = myReviews?.courts?.[c.id];
            m[c.id] = { rating: ex?.rating || 0, comment: ex?.comment || '' };
        });
        return m;
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (visible) {
            setVenueRating(myReviews?.venue?.rating || 0);
            setVenueComment(myReviews?.venue?.comment || '');
            const m = {};
            courts.forEach(c => {
                const ex = myReviews?.courts?.[c.id];
                m[c.id] = { rating: ex?.rating || 0, comment: ex?.comment || '' };
            });
            setCourtRatings(m);
        }
    }, [visible]);

    const handleSave = async () => {
        if (!venueRating && !courts.some(c => courtRatings[c.id]?.rating)) {
            Alert.alert('', 'En az bir puan vermelisiniz'); return;
        }
        setSaving(true);
        try {
            const ops = [];
            if (venueRating) ops.push(api.post(`/venues/${venue.id}/reviews`, { rating: venueRating, comment: venueComment }));
            courts.forEach(c => {
                if (courtRatings[c.id]?.rating)
                    ops.push(api.post(`/venues/${venue.id}/courts/${c.id}/reviews`, { rating: courtRatings[c.id].rating, comment: courtRatings[c.id].comment }));
            });
            await Promise.all(ops);
            onSaved?.();
            onClose?.();
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi');
        } finally { setSaving(false); }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>⭐ Yorum & Puanlama</Text>
                        <TouchableOpacity onPress={onClose}><Text style={{ color: '#6b7280', fontSize: 22 }}>✕</Text></TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        {/* Tesis puanı */}
                        <Text style={{ color: '#9ca3af', fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 }}>TESİS GENEL PUANI</Text>
                        <StarRow value={venueRating} onChange={setVenueRating} />
                        {venueRating > 0 && (
                            <TextInput
                                style={rm.input}
                                placeholder="Yorum ekle (isteğe bağlı)..."
                                placeholderTextColor="#4b5563"
                                value={venueComment}
                                onChangeText={setVenueComment}
                                multiline
                                numberOfLines={3}
                            />
                        )}

                        {/* Kort puanları */}
                        {courts.length > 0 && (
                            <>
                                <View style={{ height: 1, backgroundColor: '#ffffff10', marginVertical: 14 }} />
                                <Text style={{ color: '#9ca3af', fontSize: 11, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 }}>KORT PUANLARI (İSTEĞE BAĞLI)</Text>
                                {courts.map(c => (
                                    <View key={c.id} style={{ marginBottom: 14 }}>
                                        <Text style={{ color: '#e5e7eb', fontSize: 13, fontWeight: '700', marginBottom: 6 }}>{c.name}</Text>
                                        <StarRow value={courtRatings[c.id]?.rating || 0} onChange={v => setCourtRatings(p => ({ ...p, [c.id]: { ...p[c.id], rating: v } }))} size={24} />
                                        {courtRatings[c.id]?.rating > 0 && (
                                            <TextInput
                                                style={[rm.input, { marginTop: 6 }]}
                                                placeholder="Bu kort için yorum (isteğe bağlı)..."
                                                placeholderTextColor="#4b5563"
                                                value={courtRatings[c.id]?.comment || ''}
                                                onChangeText={v => setCourtRatings(p => ({ ...p, [c.id]: { ...p[c.id], comment: v } }))}
                                                multiline
                                                numberOfLines={2}
                                            />
                                        )}
                                    </View>
                                ))}
                            </>
                        )}

                        <TouchableOpacity onPress={handleSave} disabled={saving}
                            style={{ backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 8, marginBottom: 4 }}>
                            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Kaydet</Text>}
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

export default function VenueDetailScreen({ route, navigation }) {
    const { venue, rescheduleResId, editRivalId } = route.params;
    const [selectedCourt, setSelected] = useState(null);
    const [reviews, setReviews]         = useState(null); // null = loading
    const [showReviewModal, setShowReviewModal] = useState(false);

    const loadReviews = useCallback(() => {
        api.get(`/venues/${venue.id}/reviews`)
            .then(r => setReviews(r.data))
            .catch(() => setReviews({ reviews: [], venueRating: null, venueReviewCount: 0, courtRatings: [] }));
    }, [venue.id]);

    useEffect(() => { loadReviews(); }, [loadReviews]);

    // Giriş yapan kullanıcının kendi yorumları
    const myReviews = (() => {
        if (!reviews) return null;
        const venue_ = reviews.reviews?.find(r => !r.courtId && r.user?.id === reviews._myId);
        const courts_ = {};
        reviews.reviews?.filter(r => r.courtId && r.user?.id === reviews._myId).forEach(r => { courts_[r.courtId] = r; });
        return { venue: venue_, courts: courts_ };
    })();

    const openMaps = () => {
        let url;
        if (venue.lat && venue.lng) url = `https://maps.google.com/?q=${venue.lat},${venue.lng}`;
        else { const q = encodeURIComponent(`${venue.name}${venue.address ? ', ' + venue.address : ''}, ${venue.city}`); url = `https://maps.google.com/?q=${q}`; }
        Linking.openURL(url);
    };

    const openPhone = () => { if (!venue.phone) return; Linking.openURL(`tel:${venue.phone}`); };

    const getDayWindows = (dayNum) => {
        const openDays = venue.openDays || [1,2,3,4,5,6,7];
        if (!openDays.includes(dayNum)) return null;
        const os = venue.openSlots;
        if (os && !Array.isArray(os) && typeof os === 'object') {
            const key = String(dayNum);
            const entry = os[key] !== undefined ? os[key] : os['0'];
            if (entry !== undefined) {
                if (Array.isArray(entry) && entry.length === 0) return null;
                if (Array.isArray(entry) && entry.length > 0) return entry;
            }
        }
        return [{ from: venue.openTime || '08:00', to: venue.closeTime || '22:00' }];
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{venue.name}</Text>
            </View>

            {rescheduleResId && (
                <View style={{ backgroundColor: '#3b82f620', paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center' }}>
                    <Text style={{ color: '#60a5fa', fontSize: 12, fontWeight: '700' }}>
                        {editRivalId ? '🔄 Maçınızın kort/saatini değiştirmek için bir kort seçin' : '🔄 Rezervasyonunuzu değiştirmek için bir kort seçin'}
                    </Text>
                </View>
            )}

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                {/* Tesis Bilgileri */}
                <View style={s.infoCard}>
                    <Text style={s.infoCardTitle}>📋 Tesis Bilgileri</Text>
                    <View style={s.infoRow}>
                        <Text style={s.infoLabel}>Spor Dalı</Text>
                        <Text style={s.infoValue}>{venue.branch}</Text>
                    </View>
                    <View style={s.infoRow}>
                        <Text style={s.infoLabel}>Konum</Text>
                        <TouchableOpacity onPress={openMaps} disabled={!venue.address && !venue.lat}>
                            <Text style={[s.infoValue, (venue.address || venue.lat) && s.link]}>
                                {venue.city}{venue.district ? ` / ${venue.district}` : ''}{venue.address ? `\n${venue.address}` : ''}
                                {(venue.lat && venue.lng) ? '\n📍 Haritada Göster' : ''}
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View style={[s.infoRow, { alignItems: 'flex-start' }]}>
                        <Text style={s.infoLabel}>Çalışma{'\n'}Saatleri</Text>
                        <View style={{ flex: 1 }}>
                            {[1,2,3,4,5,6,7].map(dayNum => {
                                const windows = getDayWindows(dayNum);
                                return (
                                    <View key={dayNum} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <Text style={[s.infoLabel, { minWidth: 36, marginBottom: 0 }]}>{DAYS_TR[dayNum]}</Text>
                                        {windows === null
                                            ? <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600' }}>Kapalı</Text>
                                            : <Text style={[s.infoValue, { textAlign: 'right', flex: 1 }]}>{windows.map(w => `${w.from}–${w.to}`).join('  ')}</Text>
                                        }
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                    {(() => {
                        const lightsFrom = (venue.courts || []).find(c => c.lightsFrom)?.lightsFrom;
                        if (!lightsFrom) return null;
                        return (
                            <View style={s.infoRow}>
                                <Text style={s.infoLabel}>Gece Işığı</Text>
                                <Text style={[s.infoValue, { color: '#fbbf24' }]}>💡 {lightsFrom} itibarıyla</Text>
                            </View>
                        );
                    })()}
                    <View style={[s.infoRow, { alignItems: 'flex-start' }]}>
                        <Text style={s.infoLabel}>Rezervasyon</Text>
                        <Text style={[s.infoValue, { textAlign: 'right', flex: 1 }]}>{courtSlotLabels(venue)}</Text>
                    </View>
                    {venue.reservationOpenDaysBefore != null && (
                        <View style={s.infoRow}>
                            <Text style={s.infoLabel}>Rezervasyon{'\n'}Açılışı</Text>
                            <Text style={[s.infoValue, { color: '#fbbf24', textAlign: 'right', flex: 1 }]}>
                                {venue.reservationOpenDaysBefore} gün önceden{venue.reservationOpenTime ? `, saat ${venue.reservationOpenTime}'te` : ''}
                            </Text>
                        </View>
                    )}
                    {(() => {
                        const pw = Array.isArray(venue.pricingWindows) ? venue.pricingWindows : [];
                        if (pw.length === 0) return null;
                        return (
                            <View style={[s.infoRow, { alignItems: 'flex-start' }]}>
                                <Text style={s.infoLabel}>Ücret{'\n'}Politikası</Text>
                                <View style={{ flex: 2 }}>
                                    {pw.map((rule, i) => {
                                        const courtName = rule.courtId ? (venue.courts || []).find(c => c.id === rule.courtId)?.name : null;
                                        return (
                                            <Text key={i} style={[s.infoValue, { color: colors.yellow, textAlign: 'right', marginBottom: 3 }]}>
                                                {rule.from}–{rule.to}: {rule.price > 0 ? `${rule.price}₺` : 'Ücretsiz'}{courtName ? ` (${courtName})` : ''}
                                            </Text>
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    })()}
                    {venue.phone && (
                        <View style={s.infoRow}>
                            <Text style={s.infoLabel}>Telefon</Text>
                            <TouchableOpacity onPress={openPhone}>
                                <Text style={[s.infoValue, s.link]}>{venue.phone}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {(() => {
                        const cl = venue.contactLinks;
                        if (!cl || typeof cl !== 'object') return null;
                        const links = [
                            { key: 'whatsapp',  icon: '💬', label: 'WhatsApp',  url: v => { const d = v.replace(/\D/g,''); return `https://wa.me/${d.startsWith('0') ? '90'+d.slice(1) : d}`; } },
                            { key: 'phone',     icon: '📞', label: 'Beni Ara',  url: v => `tel:${v}` },
                            { key: 'telegram',  icon: '✈️', label: 'Telegram',  url: v => `https://t.me/${v.replace('@','')}` },
                            { key: 'instagram', icon: '📸', label: 'Instagram', url: v => `https://instagram.com/${v.replace('@','')}` },
                            { key: 'email',     icon: '📧', label: 'E-posta',   url: v => `mailto:${v}` },
                        ].filter(l => cl[l.key]);
                        if (links.length === 0) return null;
                        return (
                            <View style={[s.infoRow, { flexWrap: 'wrap', gap: 6, alignItems: 'flex-start' }]}>
                                <Text style={s.infoLabel}>İletişim</Text>
                                <View style={{ flex: 2, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                                    {links.map(l => (
                                        <TouchableOpacity key={l.key} onPress={() => Linking.openURL(l.url(cl[l.key]))}
                                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#9333ea18', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#9333ea40' }}>
                                            <Text style={{ fontSize: 13 }}>{l.icon}</Text>
                                            <Text style={{ color: colors.purpleLight, fontSize: 11, fontWeight: '700' }}>{l.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        );
                    })()}
                </View>

                {/* Puanlar */}
                <View style={s.ratingCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <Text style={s.infoCardTitle}>⭐ Puanlar & Yorumlar</Text>
                        <TouchableOpacity onPress={() => setShowReviewModal(true)}
                            style={{ backgroundColor: '#7c3aed20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#7c3aed60' }}>
                            <Text style={{ color: '#a78bfa', fontSize: 12, fontWeight: '700' }}>✏️ Yorum Yaz</Text>
                        </TouchableOpacity>
                    </View>

                    {(myReviews?.venue?.status === 'PENDING' || Object.values(myReviews?.courts || {}).some(r => r.status === 'PENDING')) && (
                        <View style={{ backgroundColor: '#fbbf2415', borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: '#fbbf2440' }}>
                            <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '700' }}>⏳ Yorumunuz admin onayı bekliyor, onaylanınca herkese görünür olacak.</Text>
                        </View>
                    )}

                    {/* Tesis genel puanı */}
                    <View style={{ marginBottom: 8 }}>
                        <Text style={{ color: '#9ca3af', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>TESİS GENEL</Text>
                        {reviews?.venueRating
                            ? <StarsDisplay value={reviews.venueRating} count={reviews.venueReviewCount} size={16} />
                            : <Text style={{ color: '#4b5563', fontSize: 12 }}>Henüz puan yok</Text>
                        }
                    </View>

                    {/* Kort bazı puanlar */}
                    {(reviews?.courtRatings || []).length > 0 && (
                        <View style={{ gap: 4, marginBottom: 8 }}>
                            {reviews.courtRatings.map(cr => (
                                <View key={cr.courtId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={{ color: '#e5e7eb', fontSize: 12, fontWeight: '700', minWidth: 60 }}>{cr.courtName}</Text>
                                    <StarsDisplay value={cr.avgRating} count={cr.count} size={13} />
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Yorumlar listesi */}
                    {(reviews?.reviews || []).length > 0 ? (
                        <View style={{ marginTop: 4 }}>
                            <View style={{ height: 1, backgroundColor: '#ffffff10', marginBottom: 10 }} />
                            {reviews.reviews.slice(0, 5).map(r => (
                                <View key={r.id} style={s.reviewItem}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <Text style={{ color: '#a78bfa', fontSize: 12, fontWeight: '700' }}>@{r.user?.username}</Text>
                                        {r.court && <Text style={{ color: '#6b7280', fontSize: 11 }}>· {r.court.name}</Text>}
                                        {r.status === 'PENDING' && <Text style={{ color: '#fbbf24', fontSize: 10, fontWeight: '700' }}>⏳ onay bekliyor</Text>}
                                        <View style={{ flex: 1 }} />
                                        <StarsDisplay value={r.rating} size={11} />
                                    </View>
                                    {r.comment ? <Text style={{ color: '#d1d5db', fontSize: 12, lineHeight: 17 }}>{r.comment}</Text> : null}
                                    <Text style={{ color: '#4b5563', fontSize: 10, marginTop: 3 }}>{new Date(r.createdAt).toLocaleDateString('tr-TR')}</Text>
                                </View>
                            ))}
                            {reviews.reviews.length > 5 && (
                                <Text style={{ color: '#6b7280', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
                                    +{reviews.reviews.length - 5} yorum daha
                                </Text>
                            )}
                        </View>
                    ) : reviews !== null ? (
                        <Text style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>İlk yorumu sen yaz!</Text>
                    ) : (
                        <ActivityIndicator size="small" color="#7c3aed" />
                    )}
                </View>

                {/* Kortlar */}
                <Text style={s.sectionTitle}>🎾 Kortlar / Sahalar</Text>
                <Text style={s.sectionHint}>Rezervasyon yapmak istediğiniz kortu seçin</Text>

                {[...(venue.courts || [])].sort((a, b) => {
                    const nA = parseInt(a.name?.match(/\d+/)?.[0] ?? '', 10);
                    const nB = parseInt(b.name?.match(/\d+/)?.[0] ?? '', 10);
                    if (!isNaN(nA) && !isNaN(nB) && nA !== nB) return nA - nB;
                    return (a.name ?? '') < (b.name ?? '') ? -1 : (a.name ?? '') > (b.name ?? '') ? 1 : 0;
                }).map(court => {
                    const cr = reviews?.courtRatings?.find(c => c.courtId === court.id);
                    return (
                        <TouchableOpacity key={court.id}
                            style={[s.courtCard, selectedCourt?.id === court.id && s.courtCardActive]}
                            onPress={() => setSelected(court)} activeOpacity={0.8}>
                            <View style={s.courtRow}>
                                <Text style={s.courtIcon}>🏓</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.courtName}>{court.name}</Text>
                                    {cr && <StarsDisplay value={cr.avgRating} count={cr.count} size={11} />}
                                </View>
                                {selectedCourt?.id === court.id && <Text style={s.courtCheck}>✓</Text>}
                            </View>
                        </TouchableOpacity>
                    );
                })}

                {selectedCourt && (
                    <TouchableOpacity style={s.reserveBtn}
                        onPress={() => navigation.navigate('CourtSlots', { venue, court: selectedCourt, rescheduleResId, editRivalId })}
                        activeOpacity={0.8}>
                        <Text style={s.reserveBtnText}>
                            {editRivalId ? `Kort/Saat Seç — ${selectedCourt.name} →` : rescheduleResId ? `Yeni Saat Seç — ${selectedCourt.name} →` : `Saat Seç — ${selectedCourt.name} →`}
                        </Text>
                    </TouchableOpacity>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            <ReviewModal
                visible={showReviewModal}
                venue={venue}
                myReviews={myReviews}
                onClose={() => setShowReviewModal(false)}
                onSaved={loadReviews}
            />
        </View>
    );
}

const rm = StyleSheet.create({
    input: { backgroundColor: '#0f0f1a', borderRadius: 8, padding: 10, color: '#e5e7eb', fontSize: 13, borderWidth: 1, borderColor: '#374151', marginTop: 8, minHeight: 60, textAlignVertical: 'top' },
});

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: colors.textSecondary, fontSize: 26, fontWeight: '300' },
    title: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '900' },
    scroll: { padding: 14 },
    infoCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: colors.border },
    infoCardTitle: { color: '#fff', fontSize: 14, fontWeight: '900', marginBottom: 12 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderColor: colors.border },
    infoLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700', flex: 1 },
    infoValue: { color: '#fff', fontSize: 13, flex: 2, textAlign: 'right' },
    link: { color: colors.purple, textDecorationLine: 'underline' },
    ratingCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: colors.border },
    reviewItem: { backgroundColor: '#ffffff06', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#ffffff10' },
    sectionTitle: { color: '#fff', fontSize: 15, fontWeight: '900', marginBottom: 4 },
    sectionHint: { color: colors.textMuted, fontSize: 12, marginBottom: 12 },
    courtCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    courtCardActive: { borderColor: colors.purple, backgroundColor: colors.purple + '12' },
    courtRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    courtIcon: { fontSize: 22 },
    courtName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
    courtCheck: { color: colors.purple, fontSize: 18, fontWeight: '900' },
    reserveBtn: { backgroundColor: colors.purple, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
    reserveBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
