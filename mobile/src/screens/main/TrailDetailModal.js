import { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, Image, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import api from '../../services/api';
import colors from '../../theme/colors';
import { moderateScale } from '../../theme/scale';

const DIFFICULTY_LABEL = { EASY: 'Kolay', MEDIUM: 'Orta', HARD: 'Zor' };

function StarRow({ value, onChange, size = 26 }) {
    return (
        <View style={{ flexDirection: 'row', gap: 6 }}>
            {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => onChange?.(n)} activeOpacity={0.7}>
                    <Text style={{ fontSize: size, color: n <= value ? '#facc15' : '#374151' }}>★</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

export default function TrailDetailModal({ visible, trailId, myId, onClose, navigation }) {
    const [trail, setTrail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [myRating, setMyRating] = useState(0);
    const [ratingComment, setRatingComment] = useState('');
    const [submittingRating, setSubmittingRating] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [sendingComment, setSendingComment] = useState(false);

    const load = () => {
        if (!trailId) return;
        setLoading(true);
        api.get(`/trails/${trailId}`)
            .then(({ data }) => setTrail(data))
            .catch(() => setTrail(null))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (visible && trailId) load();
        else { setTrail(null); setMyRating(0); setRatingComment(''); setCommentText(''); }
    }, [visible, trailId]);

    const submitRating = async () => {
        if (!myRating) return;
        setSubmittingRating(true);
        try {
            await api.post(`/trails/${trailId}/reviews`, { rating: myRating, comment: ratingComment || undefined });
            load();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'Puan gönderilemedi');
        } finally { setSubmittingRating(false); }
    };

    const sendComment = async () => {
        if (!commentText.trim()) return;
        setSendingComment(true);
        try {
            await api.post(`/trails/${trailId}/comments`, { content: commentText.trim() });
            setCommentText('');
            load();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'Yorum gönderilemedi');
        } finally { setSendingComment(false); }
    };

    const path = Array.isArray(trail?.path) ? trail.path : [];
    const coords = path.map(p => ({ latitude: p.lat, longitude: p.lng }));

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: colors.bg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 50, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <TouchableOpacity onPress={onClose} style={{ marginRight: 10 }}>
                        <Text style={{ color: colors.textMuted, fontSize: 22 }}>‹</Text>
                    </TouchableOpacity>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', flex: 1 }} numberOfLines={1}>{trail?.title || 'Rota'}</Text>
                </View>

                {loading || !trail ? (
                    <ActivityIndicator color="#65a30d" style={{ marginTop: 40 }} />
                ) : (
                    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                            {coords.length > 1 && (
                                <MapView
                                    provider={PROVIDER_DEFAULT}
                                    style={{ width: '100%', height: 220 }}
                                    initialRegion={{
                                        latitude: coords[0].latitude, longitude: coords[0].longitude,
                                        latitudeDelta: 0.05, longitudeDelta: 0.05,
                                    }}
                                >
                                    <Polyline coordinates={coords} strokeColor="#65a30d" strokeWidth={4} />
                                    <Marker coordinate={coords[0]} pinColor="#22c55e" title="Başlangıç" />
                                    <Marker coordinate={coords[coords.length - 1]} pinColor="#ef4444" title="Bitiş" />
                                </MapView>
                            )}

                            <View style={{ padding: 14 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                    {trail.verified && (
                                        <View style={{ backgroundColor: '#22c55e20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#22c55e50' }}>
                                            <Text style={{ color: '#4ade80', fontSize: 11, fontWeight: '700' }}>✓ Onaylı Rota</Text>
                                        </View>
                                    )}
                                    <View style={{ backgroundColor: '#f59e0b20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#f59e0b50' }}>
                                        <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700' }}>{DIFFICULTY_LABEL[trail.difficulty] || 'Orta'}</Text>
                                    </View>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 14, marginBottom: 12 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>📏 {trail.distanceKm?.toFixed(1)} km</Text>
                                    {trail.elevationGain != null && <Text style={{ color: colors.textSecondary, fontSize: 13 }}>⛰️ {Math.round(trail.elevationGain)} m</Text>}
                                    {trail.durationMin != null && <Text style={{ color: colors.textSecondary, fontSize: 13 }}>⏱️ {trail.durationMin} dk</Text>}
                                </View>

                                {trail.avgRating ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                                        <StarRow value={Math.round(trail.avgRating)} size={16} />
                                        <Text style={{ color: '#facc15', fontSize: 12, fontWeight: '700' }}>{trail.avgRating.toFixed(1)} ({trail.reviewCount})</Text>
                                    </View>
                                ) : null}

                                {trail.description ? <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12 }}>{trail.description}</Text> : null}

                                {Array.isArray(trail.images) && trail.images.length > 0 && (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                                        {trail.images.map((url, i) => (
                                            <Image key={i} source={{ uri: url }} style={{ width: 140, height: 100, borderRadius: 10, marginRight: 8 }} resizeMode="cover" />
                                        ))}
                                    </ScrollView>
                                )}

                                <TouchableOpacity onPress={() => trail.creator?.id && navigation?.push('Profile', { userId: trail.creator.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Ekleyen: {trail.creator?.fullName || trail.creator?.username}</Text>
                                </TouchableOpacity>

                                {/* Puan ver */}
                                <View style={{ backgroundColor: colors.surface2, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 8 }}>Bu rotayı puanla</Text>
                                    <StarRow value={myRating} onChange={setMyRating} />
                                    <TextInput
                                        style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: colors.border, marginTop: 8 }}
                                        placeholder="Yorumun (opsiyonel)"
                                        placeholderTextColor={colors.textMuted}
                                        value={ratingComment}
                                        onChangeText={setRatingComment}
                                    />
                                    <TouchableOpacity
                                        disabled={!myRating || submittingRating}
                                        onPress={submitRating}
                                        style={{ backgroundColor: '#65a30d', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8, opacity: !myRating || submittingRating ? 0.5 : 1 }}
                                    >
                                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{submittingRating ? '...' : 'Gönder'}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Yorumlar */}
                                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 8 }}>💬 Yorumlar ({trail.comments?.length || 0})</Text>
                                {(trail.comments || []).map(c => (
                                    <View key={c.id} style={{ backgroundColor: colors.surface2, borderRadius: 10, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: colors.border }}>
                                        <Text style={{ color: colors.purple, fontSize: 12, fontWeight: '700' }}>{c.user?.fullName || c.user?.username}</Text>
                                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{c.content}</Text>
                                    </View>
                                ))}
                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                                    <TextInput
                                        style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: colors.border }}
                                        placeholder="Yorum yaz..."
                                        placeholderTextColor={colors.textMuted}
                                        value={commentText}
                                        onChangeText={setCommentText}
                                    />
                                    <TouchableOpacity
                                        onPress={sendComment}
                                        disabled={sendingComment || !commentText.trim()}
                                        style={{ backgroundColor: colors.purple, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', opacity: !commentText.trim() ? 0.5 : 1 }}
                                    >
                                        <Text style={{ color: '#fff', fontWeight: '800' }}>Gönder</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </ScrollView>
                    </KeyboardAvoidingView>
                )}
            </View>
        </Modal>
    );
}
