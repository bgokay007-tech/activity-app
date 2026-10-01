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
import { pickAndUploadMedia, formatTripDate } from '../../utils/travelMedia';
import TravelSaveToListModal from '../../components/TravelSaveToListModal';
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
    const [ratingBusy, setRatingBusy] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [sending, setSending] = useState(false);
    const [saveOpen, setSaveOpen] = useState(false);
    const [completedBusy, setCompletedBusy] = useState(false);
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

    const directionsToStart = () => navigation.navigate('TravelNavigate', { routeId, approach: 'car' });

    const sendToWatch = () => {
        Alert.alert(t.tvSendToWatch, t.tvSendToWatchInfo, [
            { text: t.tvCancel, style: 'cancel' },
            { text: t.tvDownloadGpx, onPress: () => Linking.openURL(`${api.defaults.baseURL}/travel/routes/${routeId}/gpx`) },
        ]);
    };

    useFocusEffect(useCallback(() => { load(); }, [load]));

    useEffect(() => {
        const mine = data?.reviews?.find(r => r.userId === myId);
        setMyRating(mine?.rating || 0);
    }, [data, myId]);

    const isOwner = data && data.userId === myId;

    // Yıldıza dokununca hemen kaydedilir — ayrı "gönder" adımı puanı unutturuyordu.
    const rate = async (n) => {
        if (ratingBusy) return;
        const prev = myRating;
        setMyRating(n);
        setRatingBusy(true);
        try {
            const { data: rv } = await api.post(`/travel/routes/${routeId}/reviews`, { rating: n });
            setData(d => {
                const reviews = [rv, ...(d.reviews || []).filter(r => r.userId !== myId)];
                const avg = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length;
                return { ...d, reviews, ratingAvg: avg, ratingCount: reviews.length };
            });
        } catch (e) {
            setMyRating(prev);
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setRatingBusy(false); }
    };

    const sendComment = async () => {
        const text = commentText.trim();
        if (!text || sending) return;
        setSending(true);
        try {
            const { data: c } = await api.post(`/travel/routes/${routeId}/comments`, { text });
            setData(d => ({ ...d, comments: [c, ...(d.comments || [])] }));
            setCommentText('');
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setSending(false); }
    };

    const deleteComment = (c) => {
        Alert.alert('', t.tvDeleteCommentQ, [
            { text: t.tvCancel, style: 'cancel' },
            {
                text: t.yes, style: 'destructive', onPress: async () => {
                    try {
                        await api.delete(`/travel/comments/${c.id}`);
                        setData(d => ({ ...d, comments: (d.comments || []).filter(x => x.id !== c.id) }));
                    } catch (e) { Alert.alert(t.error, e?.response?.data?.message || t.actionFailed); }
                },
            },
        ]);
    };

    const toggleCompleted = async () => {
        if (completedBusy) return;
        setCompletedBusy(true);
        try {
            const { data: lists } = await api.get('/travel/lists');
            const done = (lists || []).find(l => l.kind === 'COMPLETED');
            if (!done) return;
            if (data.completedByMe) await api.delete(`/travel/lists/${done.id}/items/${routeId}`);
            else await api.post(`/travel/lists/${done.id}/items`, { routeId });
            const nowDone = !data.completedByMe;
            setData(d => ({
                ...d,
                completedByMe: nowDone,
                completedCount: Math.max(0, (d.completedCount || 0) + (nowDone ? 1 : -1)),
                myListIds: nowDone ? [...(d.myListIds || []), done.id] : (d.myListIds || []).filter(id => id !== done.id),
            }));
            if (nowDone) Alert.alert('', t.tvMarkedCompleted);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setCompletedBusy(false); }
    };

    const onListsChanged = (lists) => {
        const done = lists.find(l => l.kind === 'COMPLETED');
        setData(d => {
            const completedByMe = !!done?.hasRoute;
            const delta = completedByMe === !!d.completedByMe ? 0 : completedByMe ? 1 : -1;
            return {
                ...d,
                myListIds: lists.filter(l => l.hasRoute).map(l => l.id),
                completedByMe,
                completedCount: Math.max(0, (d.completedCount || 0) + delta),
            };
        });
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
    // Eski sürümde yorum puanla birlikte yazılıyordu — o yorumlar da listede kalsın.
    const comments = [
        ...(data.comments || []),
        ...(data.reviews || []).filter(r => r.comment).map(r => ({
            id: `r-${r.id}`, userId: r.userId, user: r.user, text: r.comment, rating: r.rating,
            media: r.media, createdAt: r.createdAt, legacy: true,
        })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[ts.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Text style={ts.backText}>{t.back}</Text></TouchableOpacity>
                <Text style={ts.title} numberOfLines={1}>{data.title}</Text>
                {data.canDelete ? <TouchableOpacity onPress={deleteRoute}><Text style={{ color: colors.red, fontSize: 18 }}>🗑</Text></TouchableOpacity> : <View style={{ width: 30 }} />}
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
                    {data.completedCount ? <Text style={s.by}>👣 {t.tvCompletedBy(data.completedCount)}</Text> : null}

                    {data.myListIds ? (
                        <View style={s.gpsRow}>
                            <TouchableOpacity style={[s.gpsBtn, data.myListIds.length > 0 && s.actionOn]} onPress={() => setSaveOpen(true)}>
                                <Text style={[s.gpsBtnText, data.myListIds.length > 0 && { color: '#fff' }]}>
                                    🔖 {data.myListIds.length ? t.tvSavedInLists(data.myListIds.length) : t.tvSave}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.gpsBtn, { borderColor: '#22c55e' }, data.completedByMe && { backgroundColor: '#22c55e' }]} onPress={toggleCompleted} disabled={completedBusy}>
                                {completedBusy ? <ActivityIndicator color="#22c55e" /> : (
                                    <Text style={[s.gpsBtnText, { color: data.completedByMe ? '#fff' : '#22c55e' }]}>
                                        {data.completedByMe ? `✅ ${t.tvCompletedDone}` : `✓ ${t.tvMarkCompleted}`}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : null}

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
                    ) : null}

                    <View style={s.reviewBox}>
                        <Text style={s.reviewTitle}>⭐ {t.tvRatingsTitle}</Text>
                        <View style={s.ratingSummary}>
                            <Text style={s.bigRating}>{data.ratingCount ? data.ratingAvg.toFixed(1) : '—'}</Text>
                            <View>
                                <Stars value={Math.round(data.ratingAvg || 0)} size={16} />
                                <Text style={s.muted}>{t.tvRatingCount(data.ratingCount || 0)}</Text>
                            </View>
                        </View>
                        {data.myListIds && !isOwner ? (
                            <>
                                <Text style={[s.muted, { marginTop: 12, marginBottom: 6 }]}>{myRating ? t.tvYourRating : t.tvRateThis}</Text>
                                <Stars value={myRating} onChange={rate} size={32} />
                            </>
                        ) : null}
                    </View>

                    <Text style={[ts.label, { fontSize: 15, color: colors.text }]}>💬 {t.tvCommentsTitle} ({comments.length})</Text>
                    {data.myListIds ? (
                        <View style={s.commentInputRow}>
                            <TextInput
                                style={[ts.input, { flex: 1, minHeight: 44, maxHeight: 120, textAlignVertical: 'top' }]}
                                value={commentText}
                                onChangeText={setCommentText}
                                placeholder={t.tvWriteComment}
                                placeholderTextColor={colors.textMuted}
                                multiline
                                maxLength={2000}
                            />
                            <TouchableOpacity style={[s.sendBtn, { opacity: commentText.trim() ? 1 : 0.5 }]} onPress={sendComment} disabled={!commentText.trim() || sending}>
                                {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.sendText}>➤</Text>}
                            </TouchableOpacity>
                        </View>
                    ) : null}
                    {comments.length === 0 ? <Text style={{ color: colors.textMuted, marginTop: 8 }}>{t.tvNoComments}</Text> : null}
                    {comments.map(c => (
                        <View key={c.id} style={s.reviewCard}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <Text style={[s.reviewer, { flex: 1 }]} numberOfLines={1}>{c.user?.fullName || c.user?.username}</Text>
                                {c.rating ? <Stars value={c.rating} size={12} /> : null}
                                <Text style={s.muted}>{formatTripDate(c.createdAt)}</Text>
                                {!c.legacy && c.userId === myId ? (
                                    <TouchableOpacity onPress={() => deleteComment(c)} hitSlop={8}><Text style={{ color: colors.textMuted }}>🗑</Text></TouchableOpacity>
                                ) : null}
                            </View>
                            <Text style={s.body}>{c.text}</Text>
                            {c.media ? <MediaStrip media={c.media} /> : null}
                        </View>
                    ))}
                </View>
            </ScrollView>

            {videoUrl ? <VideoModal url={videoUrl} onClose={() => setVideoUrl(null)} /> : null}
            <TravelSaveToListModal visible={saveOpen} routeId={routeId} onClose={() => setSaveOpen(false)} onChanged={onListsChanged} />
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
    actionOn:   { backgroundColor: ACCENT },
    ratingSummary: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    bigRating:  { color: '#facc15', fontSize: 34, fontWeight: '900' },
    muted:      { color: colors.textMuted, fontSize: 12 },
    commentInputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 6 },
    sendBtn:    { width: 46, height: 44, borderRadius: 12, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
    sendText:   { color: '#fff', fontSize: 18, fontWeight: '900' },
    reviewTitle:{ color: colors.text, fontWeight: '900', fontSize: 15, marginBottom: 8 },
    reviewCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, marginTop: 8 },
    reviewer:   { color: colors.text, fontWeight: '800', fontSize: 13 },
    videoOverlay: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
    videoClose: { position: 'absolute', top: 50, right: 20, width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff3', alignItems: 'center', justifyContent: 'center' },
    videoCloseText: { color: '#fff', fontSize: 18, fontWeight: '900' },
});
