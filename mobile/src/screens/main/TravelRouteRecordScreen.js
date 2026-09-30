import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import {
    requestTrailLocationPermissions, startRecording, stopRecording,
    getLivePoints, isRecording, pathDistanceKm,
} from '../../services/trailTracking';

const ACCENT = '#0ea5e9';
const REC = '#ef4444';
// Ekrandan çıkıp dönünce süre ve duraklar kaybolmasın.
const META_KEY = 'travel_record_meta';

export async function placeNameAt(p) {
    try {
        const [g] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
        if (!g) return '';
        const local = g.district || g.subregion || g.name || '';
        const city = g.city || g.region || '';
        return [local, city].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
    } catch { return ''; }
}

export default function TravelRouteRecordScreen({ navigation }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const mapRef = useRef(null);
    const pollRef = useRef(null);
    const [recording, setRecording] = useState(false);
    const [points, setPoints] = useState([]);
    const [startedAt, setStartedAt] = useState(null);
    const [stops, setStops] = useState([]);
    const [pos, setPos] = useState(null);
    const [follow, setFollow] = useState(true);
    const [finishing, setFinishing] = useState(false);
    const [now, setNow] = useState(Date.now());

    const startPolling = () => {
        clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            setPoints(await getLivePoints());
            setNow(Date.now());
        }, 3000);
    };

    useEffect(() => {
        let sub = null;
        (async () => {
            if (await isRecording()) {
                const meta = JSON.parse((await AsyncStorage.getItem(META_KEY)) || '{}');
                setStartedAt(meta.startedAt || Date.now());
                setStops(meta.stops || []);
                setPoints(await getLivePoints());
                setRecording(true);
                startPolling();
            }
            const { granted } = await Location.requestForegroundPermissionsAsync();
            if (!granted) return;
            sub = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 3 },
                (loc) => setPos({ lat: loc.coords.latitude, lng: loc.coords.longitude }),
            );
        })();
        return () => { sub?.remove(); clearInterval(pollRef.current); };
    }, []);

    useEffect(() => {
        if (follow && pos && mapRef.current) {
            mapRef.current.animateCamera({ center: { latitude: pos.lat, longitude: pos.lng }, zoom: 16 }, { duration: 500 });
        }
    }, [follow, pos]);

    const saveMeta = (m) => AsyncStorage.setItem(META_KEY, JSON.stringify(m)).catch(() => {});

    const handleStart = async () => {
        const perm = await requestTrailLocationPermissions();
        if (!perm.granted) { Alert.alert('', t.tvNavLocationDenied); return; }
        if (!perm.background) Alert.alert('', t.tvRecBgHint);
        await startRecording({
            accuracy: Location.Accuracy.High,
            notificationTitle: t.tvRecNotifTitle,
            notificationBody: t.tvRecNotifBody,
        });
        const ts = Date.now();
        setStartedAt(ts);
        setStops([]);
        setPoints(pos ? [{ lat: pos.lat, lng: pos.lng, t: ts }] : []);
        setRecording(true);
        setFollow(true);
        saveMeta({ startedAt: ts, stops: [] });
        startPolling();
    };

    const addStopHere = async () => {
        const p = pos || points[points.length - 1];
        if (!p) { Alert.alert('', t.tvNavNoGps); return; }
        const name = (await placeNameAt(p)) || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
        const next = [...stops, { name, lat: p.lat, lng: p.lng }];
        setStops(next);
        saveMeta({ startedAt, stops: next });
        Alert.alert('', t.tvRecStopAdded(name));
    };

    const finish = async () => {
        clearInterval(pollRef.current);
        setFinishing(true);
        try {
            const pts = (await stopRecording()).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
            await AsyncStorage.removeItem(META_KEY);
            setRecording(false);
            if (pts.length < 2) { Alert.alert('', t.tvRecTooShort); return; }
            const [startName, endName] = await Promise.all([placeNameAt(pts[0]), placeNameAt(pts[pts.length - 1])]);
            const mins = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : null;
            navigation.popTo('TravelRouteCreate', {
                recorded: {
                    path: [pts.map(p => ({ lat: p.lat, lng: p.lng }))],
                    distanceKm: Math.round(pathDistanceKm(pts) * 10) / 10,
                    durationText: mins ? t.tvDurationFmt(Math.floor(mins / 60), mins % 60) : '',
                    startPlace: startName,
                    endPlace: endName,
                    stops: stops.map(s => s.name),
                    at: Date.now(),
                },
            });
        } finally { setFinishing(false); }
    };

    const confirmFinish = () => {
        Alert.alert('', t.tvRecFinishQ, [
            { text: t.tvCancel, style: 'cancel' },
            { text: t.tvRecFinish, onPress: finish },
        ]);
    };

    const discard = () => {
        Alert.alert('', t.tvRecDiscardQ, [
            { text: t.tvCancel, style: 'cancel' },
            {
                text: t.yes, style: 'destructive', onPress: async () => {
                    clearInterval(pollRef.current);
                    await stopRecording();
                    await AsyncStorage.removeItem(META_KEY);
                    setRecording(false); setPoints([]); setStops([]); setStartedAt(null);
                },
            },
        ]);
    };

    const coords = points.map(p => ({ latitude: p.lat, longitude: p.lng }));
    const km = pathDistanceKm(points);
    const mins = startedAt ? Math.floor((now - startedAt) / 60000) : 0;

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <MapView
                ref={mapRef}
                provider={PROVIDER_DEFAULT}
                style={StyleSheet.absoluteFill}
                showsUserLocation
                showsMyLocationButton={false}
                initialRegion={{ latitude: 39.0, longitude: 35.0, latitudeDelta: 12, longitudeDelta: 12 }}
                onPanDrag={() => setFollow(false)}
            >
                {coords.length > 1 ? <Polyline coordinates={coords} strokeColor={REC} strokeWidth={5} /> : null}
                {coords[0] ? <Marker coordinate={coords[0]} pinColor="green" /> : null}
                {stops.map((s, i) => (
                    <Marker key={i} coordinate={{ latitude: s.lat, longitude: s.lng }} title={s.name} pinColor="orange" />
                ))}
            </MapView>

            <View style={[s.topBar, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.roundBtn}><Text style={s.roundText}>‹</Text></TouchableOpacity>
                <Text style={s.title} numberOfLines={1}>{t.tvRecTitle}</Text>
                {recording ? <View style={s.recDot}><Text style={s.recText}>● REC</Text></View> : <View style={{ width: 38 }} />}
            </View>

            <TouchableOpacity style={[s.followBtn, { top: Math.max(insets.top, 12) + 60 }, follow && { backgroundColor: ACCENT }]} onPress={() => setFollow(f => !f)}>
                <Text style={{ fontSize: 18 }}>🎯</Text>
            </TouchableOpacity>

            <View style={[s.panel, { paddingBottom: insets.bottom + 14 }]}>
                {!pos ? <Text style={s.muted}>{t.tvNavNoGps}</Text> : null}
                <View style={s.stats}>
                    <View style={s.stat}><Text style={s.statVal}>{km.toFixed(2)} km</Text><Text style={s.statLbl}>{t.tvRecDistance}</Text></View>
                    <View style={s.stat}><Text style={s.statVal}>{t.tvDurationFmt(Math.floor(mins / 60), mins % 60)}</Text><Text style={s.statLbl}>{t.tvDuration}</Text></View>
                    <View style={s.stat}><Text style={s.statVal}>{stops.length}</Text><Text style={s.statLbl}>{t.tvStops}</Text></View>
                </View>

                {!recording ? (
                    <>
                        <Text style={s.hint}>{t.tvRecHint}</Text>
                        <TouchableOpacity style={[s.bigBtn, { backgroundColor: REC }]} onPress={handleStart}>
                            <Text style={s.bigBtnText}>▶ {t.tvRecStart}</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <TouchableOpacity style={s.outlineBtn} onPress={addStopHere}>
                            <Text style={s.outlineText}>📍 {t.tvRecAddStop}</Text>
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <TouchableOpacity style={[s.outlineBtn, { flex: 1, borderColor: colors.border, marginTop: 0 }]} onPress={discard}>
                                <Text style={[s.outlineText, { color: colors.textMuted }]}>🗑 {t.tvRecDiscard}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.bigBtn, { flex: 2, backgroundColor: ACCENT, marginTop: 0 }]} onPress={confirmFinish} disabled={finishing}>
                                {finishing ? <ActivityIndicator color="#fff" /> : <Text style={s.bigBtnText}>■ {t.tvRecFinish}</Text>}
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    topBar:    { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, backgroundColor: '#000a' },
    roundBtn:  { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff2', alignItems: 'center', justifyContent: 'center' },
    roundText: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: -3 },
    title:     { flex: 1, color: '#fff', fontWeight: '900', fontSize: 16, marginHorizontal: 10 },
    recDot:    { backgroundColor: `${REC}33`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
    recText:   { color: REC, fontWeight: '900', fontSize: 12 },
    followBtn: { position: 'absolute', right: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    panel:     { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, borderColor: colors.border },
    muted:     { color: colors.textMuted, fontSize: 13, marginBottom: 8 },
    hint:      { color: colors.textMuted, fontSize: 12, marginTop: 10, lineHeight: 17 },
    stats:     { flexDirection: 'row', justifyContent: 'space-between' },
    stat:      { flex: 1, alignItems: 'center' },
    statVal:   { color: colors.text, fontWeight: '900', fontSize: 18 },
    statLbl:   { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    bigBtn:    { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
    bigBtnText:{ color: '#fff', fontWeight: '900', fontSize: 15 },
    outlineBtn:{ borderWidth: 1, borderColor: ACCENT, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
    outlineText:{ color: ACCENT, fontWeight: '800', fontSize: 14 },
});
