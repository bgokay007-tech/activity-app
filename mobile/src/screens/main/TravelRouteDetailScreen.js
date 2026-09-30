import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image,
    Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Dimensions, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { useVideoPlayer, VideoView } from 'expo-video';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { pickAndUploadMedia } from '../../utils/travelMedia';
import {
    normalizeSegments, regionForSegments, getOfflineEntry, loadOfflineRoute,
    downloadOfflineRoute, deleteOfflineRoute,
} from '../../utils/travelOffline';
import { travelStyles as ts } from './TravelExploreHomeScreen';
import { MediaStrip } from './TravelRouteCreateScreen';

const { width: SW } = Dimensions.get('window');
const ACCENT = '#0ea5e9';

function VideoModal({ url, onClose }) {
    const player = useVideoPlayer(url, (p) => { p.play(); });
    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.videoOverlay}>
                <VideoView player={player} style={{ width: SW, height: SW * 1.2 }} nativeControls contentFit="contain" />
                <TouchableOpacity onPress={onClose} style={s.videoClose}><Text style={s.videoCloseText}>✕</Text></TouchableOpacity>
            </View>
        </Modal>
    );
}

function Stars({ value, onChange, size = 28 }) {
    return (
        <View style={{ flexDirection: 'row', gap: 6 }}>
            {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={onChange ? () => onChange(n) : undefined} disabled={!onChange}>
                    <Text style={{ fontSize: size, color: n <= value ? '#facc15' : colors.border }}>★</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

export default function TravelRouteDetailScreen({ navigation, route: navRoute }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const myId = useSelector(st => st.auth.user?.id);
    const { routeId } = navRoute.params || {};
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [videoUrl, setVideoUrl] = useState(null);
    const [myRating, setMyRating] = useState(0);
    const [myComment, setMyComment] = useState('');
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [offlineEntry, setOfflineEntry] = useState(null);
    const [dlProgress, setDlProgress] = useState(null);

    const load = useCallback(async () => {
        const entry = await getOfflineEntry(routeId);
        setOfflineEntry(entry);
        try {
            const { data: r, status } = await api.get(`/travel/routes/${routeId}`);
            setData(status < 300 ? r : null);
        } catch {
            // İnternet yoksa indirilmiş kopyayı aç.
            setData(entry ? await loadOfflineRoute(routeId) : null);
        } finally { setLoading(false); }
    }, [routeId]);

    const segs = useMemo(() => normalizeSegments(data?.path), [data]);
    const previewRegion = useMemo(() => (segs.length ? regionForSegments(segs) : null), [segs]);

    const downloadOffline = async () => {
        if (dlProgress != null) return;
        setDlProgress(0);
        try {
            const entry = await downloadOfflineRoute(data, p => setDlProgress(p));
            setOfflineEntry(entry);
            Alert.alert('', t.tvOfflineReady);
        } catch {
            Alert.alert(t.error, t.actionFailed);
        } finally { setDlProgress(null); }
    };

    const removeOffline = () => {
        Alert.alert('', t.tvDeleteOfflineQ, [
            { text: t.no, style: 'cancel' },
            { text: t.yes, style: 'destructive', onPress: async () => { await deleteOfflineRoute(routeId); setOfflineEntry(null); } },
        ]);
    };

    const directionsToStart = () => {
        const p = segs[0]?.[0];
        const dest = p ? `${p.lat},${p.lng}` : encodeURIComponent(data.startPlace);
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`);
    };

    const sendToWatch = () => {
        Alert.alert(t.tvSendToWatch, t.tvSendToWatchInfo, [
            { text: t.tvCancel, style: 'cancel' },
            { text: t.tvDownloadGpx, onPress: () => Linking.openURL(`${api.defaults.baseURL}/travel/routes/${routeId}/gpx`) },
        ]);
    };

    useFocusEffect(useCallback(() => { load(); }, [load]));

    useEffect(() => {
        const mine = data?.reviews?.find(r => r.userId === myId);
        if (mine) { setMyRating(mine.rating); setMyComment(mine.comment || ''); }
    }, [data, myId]);

    const isOwner = data && data.userId === myId;

    const sendReview = async () => {
        if (!myRating) { Alert.alert('', t.tvPickRating); return; }
        setSending(true);
        try {
            await api.post(`/travel/routes/${routeId}/reviews`, { rating: myRating, comment: myComment });
            Alert.alert('', t.tvReviewSaved);
            load();
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setSending(false); }
    };

    const addMedia = async () => {
        if (uploading) return;
        setUploading(true);
        try {
            const added = await pickAndUploadMedia(t);
            if (added.length) {
                await api.post(`/travel/routes/${routeId}/media`, { media: added });
                load();
            }
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setUploading(false); }
    };

    const deleteRoute = () => {
        Alert.alert('', t.tvDeleteRouteQ, [
            { text: t.no, style: 'cancel' },
            {
                text: t.yes, style: 'destructive', onPress: async () => {
                    try { await api.delete(`/travel/routes/${routeId}`); navigation.goBack(); }
                    catch (e) { Alert.alert(t.error, e?.response?.data?.message || t.actionFailed); }
                },
            },
        ]);
    };

    if (loading) return <View style={s.center}><ActivityIndicator color={ACCENT} /></View>;
    if (!data) return (
        <View style={s.center}>
            <Text style={{ color: colors.textMuted }}>{t.actionFailed}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}><Text style={[ts.backText, { marginTop: 12 }]}>{t.back}</Text></TouchableOpacity>
        </View>
    );

    const media = Array.isArray(data.media) ? data.media : [];

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[ts.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Text style={ts.backText}>{t.back}</Text></TouchableOpacity>
                <Text style={ts.title} numberOfLines={1}>{data.title}</Text>
                {isOwner ? <TouchableOpacity onPress={deleteRoute}><Text style={{ color: colors.red, fontSize: 18 }}>🗑</Text></TouchableOpacity> : <View style={{ width: 30 }} />}
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60 }} keyboardShouldPersistTaps="handled">
                {media.length > 0 ? (
                    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                        {media.map((m, i) => (
                            <TouchableOpacity key={`${m.url}-${i}`} activeOpacity={0.9} onPress={() => m.type === 'video' && setVideoUrl(m.url)}>
                                {m.type === 'image'
                                    ? <Image source={{ uri: m.url }} style={s.hero} />
                                    : <View style={[s.hero, s.heroVideo]}><Text style={{ fontSize: 54 }}>▶️</Text></View>}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                ) : null}

                <View style={{ paddingHorizontal: 16 }}>
                    <Text style={s.place}>📍 {data.startPlace}{data.endPlace ? ` → ${data.endPlace}` : ''}</Text>
                    <View style={s.metaRow}>
                        <Text style={s.rating}>★ {data.ratingCount ? data.ratingAvg.toFixed(1) : '—'} ({t.tvRatingCount(data.ratingCount || 0)})</Text>
                        {data.difficulty ? <Text style={s.badge}>{t.tvDifficulty}: {t[`tvDiff${data.difficulty}`]}</Text> : null}
                        {data.distanceKm ? <Text style={s.badge}>{data.distanceKm} km</Text> : null}
                        {data.durationText ? <Text style={s.badge}>⏱ {data.durationText}</Text> : null}
                    </View>
                    {data.source === 'OSM' ? (
                        <TouchableOpacity onPress={() => data.sourceUrl && Linking.openURL(data.sourceUrl)} disabled={!data.sourceUrl}>
                            <Text style={s.by}>🗺️ {t.tvOsmSource}</Text>
                        </TouchableOpacity>
                    ) : (
                        <Text style={s.by}>{t.tvByUser(data.user?.fullName || data.user?.username || '')}</Text>
                    )}

                    {previewRegion ? (
                        <>
                            <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('TravelNavigate', { routeId })} style={s.mapBox}>
                                <MapView
                                    provider={PROVIDER_DEFAULT}
                                    style={StyleSheet.absoluteFill}
                                    initialRegion={previewRegion}
                                    liteMode
                                    scrollEnabled={false}
                                    zoomEnabled={false}
                                    rotateEnabled={false}
                                    pitchEnabled={false}
                                    pointerEvents="none"
                                >
                                    {segs.map((seg, i) => (
                                        <Polyline key={i} coordinates={seg.map(p => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={ACCENT} strokeWidth={4} />
                                    ))}
                                    <Marker coordinate={{ latitude: segs[0][0].lat, longitude: segs[0][0].lng }} pinColor="green" />
                                </MapView>
                            </TouchableOpacity>
                            <TouchableOpacity style={ts.primaryBtn} onPress={() => navigation.navigate('TravelNavigate', { routeId })}>
                                <Text style={ts.primaryBtnText}>🧭 {t.tvStartNav}</Text>
                            </TouchableOpacity>
                            <View style={s.gpsRow}>
                                {offlineEntry ? (
                                    <TouchableOpacity style={[s.gpsBtn, { borderColor: '#22c55e' }]} onPress={removeOffline}>
                                        <Text style={[s.gpsBtnText, { color: '#22c55e' }]}>✓ {t.tvOfflineSaved}</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity style={s.gpsBtn} onPress={downloadOffline} disabled={dlProgress != null}>
                                        <Text style={s.gpsBtnText}>
                                            {dlProgress != null ? t.tvDownloading(Math.round(dlProgress * 100)) : `⬇️ ${t.tvDownloadOffline}`}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity style={s.gpsBtn} onPress={sendToWatch}>
                                    <Text style={s.gpsBtnText}>⌚ {t.tvSendToWatch}</Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity style={[s.gpsBtn, { marginTop: 8 }]} onPress={directionsToStart}>
                                <Text style={s.gpsBtnText}>🚗 {t.tvDirectionsToStart}</Text>
                            </TouchableOpacity>
                        </>
                    ) : null}

                    {data.stops?.length ? (
                        <>
                            <Text style={ts.label}>{t.tvStops}</Text>
                            {data.stops.map((st, i) => <Text key={i} style={s.stop}>• {st}</Text>)}
                        </>
                    ) : null}

                    {data.experience ? (
                        <>
                            <Text style={ts.label}>{t.tvExperience}</Text>
                            <Text style={s.body}>{data.experience}</Text>
                        </>
                    ) : null}

                    {isOwner ? (
                        <TouchableOpacity style={s.mediaBtn} onPress={addMedia} disabled={uploading}>
                            {uploading ? <ActivityIndicator color={ACCENT} /> : <Text style={s.link}>{t.tvAddMedia}</Text>}
                        </TouchableOpacity>
                    ) : (
                        <View style={s.reviewBox}>
                            <Text style={s.reviewTitle}>{t.tvRateThis}</Text>
                            <Stars value={myRating} onChange={setMyRating} />
                            <TextInput
                                style={[ts.input, { minHeight: 70, textAlignVertical: 'top', marginTop: 10 }]}
                                value={myComment}
                                onChangeText={setMyComment}
                                placeholder={t.tvYourComment}
                                placeholderTextColor={colors.textMuted}
                                multiline
                            />
                            <TouchableOpacity style={[ts.primaryBtn, { opacity: sending ? 0.6 : 1 }]} onPress={sendReview} disabled={sending}>
                                {sending ? <ActivityIndicator color="#fff" /> : <Text style={ts.primaryBtnText}>{t.tvSendReview}</Text>}
                            </TouchableOpacity>
                        </View>
                    )}

                    <Text style={[ts.label, { fontSize: 15, color: colors.text }]}>{t.tvReviews}</Text>
                    {(data.reviews || []).length === 0 ? <Text style={{ color: colors.textMuted }}>{t.tvNoReviews}</Text> : null}
                    {(data.reviews || []).map(rv => (
                        <View key={rv.id} style={s.reviewCard}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={s.reviewer}>{rv.user?.fullName || rv.user?.username}</Text>
                                <Stars value={rv.rating} size={14} />
                            </View>
                            {rv.comment ? <Text style={s.body}>{rv.comment}</Text> : null}
                            <MediaStrip media={rv.media} />
                        </View>
                    ))}
                </View>
            </ScrollView>

            {videoUrl ? <VideoModal url={videoUrl} onClose={() => setVideoUrl(null)} /> : null}
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    center:     { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    hero:       { width: SW, height: SW * 0.66 },
    heroVideo:  { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    place:      { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 14 },
    metaRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' },
    rating:     { color: '#facc15', fontWeight: '800', fontSize: 13 },
    badge:      { color: ACCENT, borderColor: `${ACCENT}88`, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, fontSize: 11, fontWeight: '800' },
    by:         { color: colors.textMuted, fontSize: 12, marginTop: 8 },
    mapBox:     { height: 190, borderRadius: 14, overflow: 'hidden', marginTop: 14, borderWidth: 1, borderColor: colors.border },
    gpsRow:     { flexDirection: 'row', gap: 8, marginTop: 8 },
    gpsBtn:     { flex: 1, borderWidth: 1, borderColor: ACCENT, borderRadius: 12, paddingVertical: 11, alignItems: 'center', paddingHorizontal: 6 },
    gpsBtnText: { color: ACCENT, fontWeight: '800', fontSize: 13, textAlign: 'center' },
    stop:       { color: colors.textSecondary, fontSize: 14, marginBottom: 3 },
    body:       { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 4 },
    mediaBtn:   { borderWidth: 1, borderStyle: 'dashed', borderColor: ACCENT, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
    link:       { color: ACCENT, fontWeight: '800', fontSize: 14 },
    reviewBox:  { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 18 },
    reviewTitle:{ color: colors.text, fontWeight: '900', fontSize: 15, marginBottom: 8 },
    reviewCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, marginTop: 8 },
    reviewer:   { color: colors.text, fontWeight: '800', fontSize: 13 },
    videoOverlay: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
    videoClose: { position: 'absolute', top: 50, right: 20, width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff3', alignItems: 'center', justifyContent: 'center' },
    videoCloseText: { color: '#fff', fontSize: 18, fontWeight: '900' },
});
