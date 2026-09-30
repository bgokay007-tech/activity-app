import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import MapView, { Polyline, Marker, LocalTile, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import {
    buildNavModel, navProgress, regionForSegments,
    getOfflineEntry, loadOfflineRoute, tilePathTemplate,
} from '../../utils/travelOffline';
import { startBackgroundNav, stopBackgroundNav, getActiveNavRouteId } from '../../services/travelNav';

const ACCENT = '#0ea5e9';
const OFF_ROUTE_M = 80;

const fmtKm = (m) => (m == null ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`);

export default function TravelNavigateScreen({ navigation, route: navRoute }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const { routeId } = navRoute.params || {};
    const mapRef = useRef(null);
    const [route, setRoute] = useState(null);
    const [offline, setOffline] = useState(null);
    const [loading, setLoading] = useState(true);
    const [pos, setPos] = useState(null);
    const [follow, setFollow] = useState(true);
    const [bgOn, setBgOn] = useState(false);
    const [denied, setDenied] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            const entry = await getOfflineEntry(routeId);
            let r = null;
            try {
                const { data, status } = await api.get(`/travel/routes/${routeId}`);
                if (status < 300 && data?.id) r = data;
            } catch { /* çevrimdışı */ }
            if (!r && entry) r = await loadOfflineRoute(routeId);
            if (!alive) return;
            setOffline(entry);
            setRoute(r);
            setLoading(false);
            setBgOn((await getActiveNavRouteId()) === routeId);
        })();
        return () => { alive = false; };
    }, [routeId]);

    useEffect(() => {
        let sub = null;
        (async () => {
            const { granted } = await Location.requestForegroundPermissionsAsync();
            if (!granted) { setDenied(true); return; }
            sub = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 3 },
                (loc) => setPos({ lat: loc.coords.latitude, lng: loc.coords.longitude, heading: loc.coords.heading }),
            );
        })();
        return () => { sub?.remove(); };
    }, []);

    const model = useMemo(() => (route ? buildNavModel(route.path) : null), [route]);
    const prog = useMemo(() => (model && pos ? navProgress(model, pos) : null), [model, pos]);
    const region = useMemo(() => (model ? regionForSegments(model.segs) : null), [model]);

    useEffect(() => {
        if (follow && pos && mapRef.current) {
            mapRef.current.animateCamera({ center: { latitude: pos.lat, longitude: pos.lng } }, { duration: 500 });
        }
    }, [follow, pos]);

    const toggleBackground = async () => {
        if (bgOn) { await stopBackgroundNav(); setBgOn(false); return; }
        try {
            const r = await startBackgroundNav({
                routeId, title: route.title, path: model.segs,
                strings: {
                    body: t.tvNavNotifBody, off: t.tvNavNotifOff, arrived: t.tvNavArrived,
                    fgTitle: t.tvNavTitle, fgBody: route.title,
                },
            });
            if (!r.ok) { Alert.alert('', t.tvNavLocationDenied); return; }
            setBgOn(true);
            Alert.alert('', t.tvNavBackgroundInfo);
        } catch (e) {
            Alert.alert(t.error, e?.message || t.actionFailed);
        }
    };

    const directionsToStart = () => {
        if (!model?.start) return;
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${model.start.lat},${model.start.lng}&travelmode=driving`);
    };

    if (loading) return <View style={s.center}><ActivityIndicator color={ACCENT} /></View>;
    if (!route || !model?.segs?.length) return (
        <View style={s.center}>
            <Text style={{ color: colors.textMuted }}>{t.tvNoGpsData}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.back}>{t.back}</Text></TouchableOpacity>
        </View>
    );

    const off = prog && prog.offRouteM > OFF_ROUTE_M;
    const farFromRoute = prog && prog.offRouteM > 2000;

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <MapView
                ref={mapRef}
                provider={PROVIDER_DEFAULT}
                style={StyleSheet.absoluteFill}
                initialRegion={region}
                showsUserLocation
                showsMyLocationButton={false}
                mapType={offline ? 'none' : 'standard'}
                maxZoomLevel={offline ? offline.maxZ : undefined}
                onPanDrag={() => setFollow(false)}
            >
                {offline ? <LocalTile pathTemplate={tilePathTemplate(routeId)} tileSize={256} zIndex={-1} /> : null}
                {model.segs.map((seg, i) => (
                    <Polyline
                        key={i}
                        coordinates={seg.map(p => ({ latitude: p.lat, longitude: p.lng }))}
                        strokeColor={ACCENT}
                        strokeWidth={5}
                    />
                ))}
                {model.start ? <Marker coordinate={{ latitude: model.start.lat, longitude: model.start.lng }} pinColor="green" /> : null}
                {model.end ? <Marker coordinate={{ latitude: model.end.lat, longitude: model.end.lng }} pinColor="red" /> : null}
            </MapView>

            <View style={[s.topBar, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.roundBtn}><Text style={s.roundText}>‹</Text></TouchableOpacity>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={s.title} numberOfLines={1}>{route.title}</Text>
                    {offline ? <Text style={s.offlineTag}>{t.tvOfflineMode}</Text> : null}
                </View>
            </View>

            <View style={[s.panel, { paddingBottom: insets.bottom + 14 }]}>
                {denied ? <Text style={s.warn}>{t.tvNavLocationDenied}</Text> : null}
                {!denied && !pos ? <Text style={s.muted}>{t.tvNavNoGps}</Text> : null}
                {prog?.arrived ? <Text style={s.arrived}>{t.tvNavArrived}</Text> : null}
                {prog && !prog.arrived ? (
                    <>
                        {farFromRoute ? (
                            <Text style={s.warn}>{t.tvNavToStart(fmtKm(prog.toStartM))}</Text>
                        ) : off ? (
                            <Text style={s.warn}>{t.tvNavOffRoute(Math.round(prog.offRouteM))}</Text>
                        ) : (
                            <Text style={s.ok}>{t.tvNavOnRoute}</Text>
                        )}
                        <View style={s.stats}>
                            <View style={s.stat}><Text style={s.statVal}>%{prog.pct}</Text><Text style={s.statLbl}>{t.tvNavProgress}</Text></View>
                            <View style={s.stat}><Text style={s.statVal}>{fmtKm(prog.remainingM)}</Text><Text style={s.statLbl}>{t.tvNavRemaining}</Text></View>
                            <View style={s.stat}><Text style={s.statVal}>{fmtKm(model.totalM)}</Text><Text style={s.statLbl}>{t.tvNavTotal}</Text></View>
                        </View>
                        <View style={s.bar}><View style={[s.barFill, { width: `${prog.pct}%` }]} /></View>
                    </>
                ) : null}

                <View style={s.btnRow}>
                    <TouchableOpacity style={[s.btn, follow && s.btnActive]} onPress={() => setFollow(f => !f)}>
                        <Text style={[s.btnText, follow && { color: '#fff' }]}>🎯 {t.tvNavFollow}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btn, bgOn && s.btnActive]} onPress={toggleBackground}>
                        <Text style={[s.btnText, bgOn && { color: '#fff' }]}>⌚ {bgOn ? t.tvNavStop : t.tvNavBackground}</Text>
                    </TouchableOpacity>
                </View>
                {farFromRoute ? (
                    <TouchableOpacity style={[s.btn, { marginTop: 8 }]} onPress={directionsToStart}>
                        <Text style={s.btnText}>🚗 {t.tvDirectionsToStart}</Text>
                    </TouchableOpacity>
                ) : null}
                <Text style={s.attr}>© OpenStreetMap</Text>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    center:    { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    back:      { color: ACCENT, fontWeight: '800', marginTop: 12 },
    topBar:    { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, backgroundColor: '#000a' },
    roundBtn:  { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff2', alignItems: 'center', justifyContent: 'center' },
    roundText: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: -3 },
    title:     { color: '#fff', fontWeight: '900', fontSize: 16 },
    offlineTag:{ color: '#fde047', fontSize: 11, fontWeight: '800', marginTop: 2 },
    panel:     { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, borderColor: colors.border },
    warn:      { color: '#f97316', fontWeight: '900', fontSize: 14, marginBottom: 8 },
    ok:        { color: '#22c55e', fontWeight: '900', fontSize: 14, marginBottom: 8 },
    arrived:   { color: '#22c55e', fontWeight: '900', fontSize: 18, marginBottom: 8, textAlign: 'center' },
    muted:     { color: colors.textMuted, fontSize: 13, marginBottom: 8 },
    stats:     { flexDirection: 'row', justifyContent: 'space-between' },
    stat:      { flex: 1, alignItems: 'center' },
    statVal:   { color: colors.text, fontWeight: '900', fontSize: 18 },
    statLbl:   { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    bar:       { height: 6, borderRadius: 3, backgroundColor: colors.surface2, marginTop: 10, overflow: 'hidden' },
    barFill:   { height: 6, backgroundColor: ACCENT },
    btnRow:    { flexDirection: 'row', gap: 8, marginTop: 12 },
    btn:       { flex: 1, borderWidth: 1, borderColor: ACCENT, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
    btnActive: { backgroundColor: ACCENT },
    btnText:   { color: ACCENT, fontWeight: '800', fontSize: 13 },
    attr:      { color: colors.textMuted, fontSize: 10, textAlign: 'right', marginTop: 8 },
});
