import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import MapView, { Polyline, Marker, LocalTile, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import {
    buildNavModel, navProgress, regionForSegments, donePolylines, fetchDirections, haversineM,
    getOfflineEntry, loadOfflineRoute, tilePathTemplate,
} from '../../utils/travelOffline';
import { startBackgroundNav, stopBackgroundNav, getActiveNavRouteId } from '../../services/travelNav';

const ACCENT = '#0ea5e9';
const DONE = '#22c55e';
const TRACK = '#a855f7';
const APPROACH = '#f97316';
const OFF_ROUTE_M = 80;
const FAR_M = 2000;

const fmtKm = (m) => (m == null ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`);
const toLL = (p) => ({ latitude: p.lat, longitude: p.lng });

export default function TravelNavigateScreen({ navigation, route: navRoute }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const { routeId, approach: approachParam } = navRoute.params || {};
    const mapRef = useRef(null);
    const autoApproachDone = useRef(false);
    const [route, setRoute] = useState(null);
    const [offline, setOffline] = useState(null);
    const [loading, setLoading] = useState(true);
    const [pos, setPos] = useState(null);
    const [track, setTrack] = useState([]);
    const [follow, setFollow] = useState(true);
    const [bgOn, setBgOn] = useState(false);
    const [denied, setDenied] = useState(false);
    const [approach, setApproach] = useState(null);
    const [approachLoading, setApproachLoading] = useState(false);

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
                { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 3 },
                (loc) => {
                    const p = { lat: loc.coords.latitude, lng: loc.coords.longitude };
                    setPos(p);
                    // Kat edilen yol: GPS titremesi çizgiyi kirletmesin diye 5 m altı atlanır.
                    setTrack(prev => (prev.length && haversineM(prev[prev.length - 1], p) < 5 ? prev : [...prev, p].slice(-5000)));
                },
            );
        })();
        return () => { sub?.remove(); };
    }, []);

    const model = useMemo(() => (route ? buildNavModel(route.path) : null), [route]);
    const prog = useMemo(() => (model && pos ? navProgress(model, pos) : null), [model, pos]);
    const region = useMemo(() => (model ? regionForSegments(model.segs) : null), [model]);
    const done = useMemo(() => donePolylines(model, prog), [model, prog]);

    useEffect(() => {
        if (follow && pos && mapRef.current) {
            mapRef.current.animateCamera({ center: toLL(pos) }, { duration: 500 });
        }
    }, [follow, pos]);

    // Yaklaşma rotasının hedefine varınca navigasyona geç.
    useEffect(() => {
        if (approach && pos && haversineM(pos, approach.target) < 50) {
            setApproach(null);
            Alert.alert('', t.tvApproachArrived);
        }
    }, [approach, pos, t]);

    const getDirections = async (mode, targetKind) => {
        if (!pos || !model) { Alert.alert('', t.tvNavNoGps); return; }
        const target = targetKind === 'nearest' && prog ? prog.nearest : model.start;
        setApproachLoading(true);
        try {
            const d = await fetchDirections(pos, target, mode);
            setApproach(d);
            setFollow(false);
            mapRef.current?.fitToCoordinates([toLL(pos), ...d.coords.map(toLL)], {
                edgePadding: { top: 120, right: 40, bottom: 320, left: 40 }, animated: true,
            });
        } catch {
            Alert.alert('', t.tvApproachFailed);
        } finally { setApproachLoading(false); }
    };

    // Detaydan "başlangıca yol tarifi" ile gelindiyse konum gelince otomatik çiz.
    useEffect(() => {
        if (approachParam && !autoApproachDone.current && pos && model) {
            autoApproachDone.current = true;
            getDirections(approachParam === 'foot' ? 'foot' : 'car', 'start');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [approachParam, pos, model]);

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

    const showWholeRoute = () => {
        setFollow(false);
        if (region) mapRef.current?.animateToRegion(region, 500);
    };

    if (loading) return <View style={s.center}><ActivityIndicator color={ACCENT} /></View>;
    if (!route || !model?.segs?.length) return (
        <View style={s.center}>
            <Text style={{ color: colors.textMuted }}>{t.tvNoGpsData}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.back}>{t.back}</Text></TouchableOpacity>
        </View>
    );

    const off = prog && prog.offRouteM > OFF_ROUTE_M;
    const far = prog && prog.offRouteM > FAR_M;
    const approachLeftM = approach && pos ? haversineM(pos, approach.target) : null;
    const approachMin = approach ? Math.max(1, Math.round(approach.durationS / 60)) : 0;

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <MapView
                ref={mapRef}
                provider={PROVIDER_DEFAULT}
                style={StyleSheet.absoluteFill}
                initialRegion={region}
                showsUserLocation
                showsMyLocationButton={false}
                showsCompass
                mapType={offline ? 'none' : 'standard'}
                maxZoomLevel={offline ? offline.maxZ : undefined}
                onPanDrag={() => setFollow(false)}
            >
                {offline ? <LocalTile pathTemplate={tilePathTemplate(routeId)} tileSize={256} zIndex={-1} /> : null}
                {model.segs.map((seg, i) => (
                    <Polyline key={`r${i}`} coordinates={seg.map(toLL)} strokeColor={ACCENT} strokeWidth={5} zIndex={1} />
                ))}
                {done.map((line, i) => (
                    <Polyline key={`d${i}`} coordinates={line.map(toLL)} strokeColor={DONE} strokeWidth={6} zIndex={2} />
                ))}
                {track.length > 1 ? <Polyline coordinates={track.map(toLL)} strokeColor={TRACK} strokeWidth={4} zIndex={3} /> : null}
                {approach ? (
                    <Polyline coordinates={approach.coords.map(toLL)} strokeColor={APPROACH} strokeWidth={5} lineDashPattern={[12, 8]} zIndex={4} />
                ) : null}
                {model.start ? <Marker coordinate={toLL(model.start)} pinColor="green" title={route.startPlace} /> : null}
                {model.end ? <Marker coordinate={toLL(model.end)} pinColor="red" title={route.endPlace || route.title} /> : null}
            </MapView>

            <View style={[s.topBar, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.roundBtn}><Text style={s.roundText}>‹</Text></TouchableOpacity>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={s.title} numberOfLines={1}>{route.title}</Text>
                    {offline ? <Text style={s.offlineTag}>{t.tvOfflineMode}</Text> : null}
                </View>
            </View>

            <View style={[s.sideBtns, { top: Math.max(insets.top, 12) + 64 }]}>
                <TouchableOpacity style={[s.sideBtn, follow && { backgroundColor: ACCENT }]} onPress={() => setFollow(f => !f)}>
                    <Text style={s.sideIcon}>🎯</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.sideBtn} onPress={showWholeRoute}>
                    <Text style={s.sideIcon}>🗺️</Text>
                </TouchableOpacity>
            </View>

            <View style={[s.panel, { paddingBottom: insets.bottom + 14 }]}>
                <View style={s.legend}>
                    <Text style={[s.legendItem, { color: ACCENT }]}>━ {t.tvLegendRoute}</Text>
                    <Text style={[s.legendItem, { color: DONE }]}>━ {t.tvLegendDone}</Text>
                    <Text style={[s.legendItem, { color: TRACK }]}>━ {t.tvYourTrack}</Text>
                </View>

                {denied ? <Text style={s.warn}>{t.tvNavLocationDenied}</Text> : null}
                {!denied && !pos ? <Text style={s.muted}>{t.tvNavNoGps}</Text> : null}

                {approach ? (
                    <View style={s.approachBox}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.approachTitle}>{approach.mode === 'foot' ? '🚶' : '🚗'} {t.tvApproachInfo(fmtKm(approach.distanceM), t.tvDurationFmt(Math.floor(approachMin / 60), approachMin % 60))}</Text>
                            <Text style={s.muted}>{t.tvApproachLeft(fmtKm(approachLeftM))}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setApproach(null)} style={s.closeBtn}><Text style={s.closeText}>✕</Text></TouchableOpacity>
                    </View>
                ) : null}

                {prog?.arrived ? <Text style={s.arrived}>{t.tvNavArrived}</Text> : null}
                {prog && !prog.arrived ? (
                    <>
                        {!approach ? (
                            far ? <Text style={s.warn}>{t.tvNavToStart(fmtKm(prog.offRouteM))}</Text>
                                : off ? <Text style={s.warn}>{t.tvNavOffRoute(Math.round(prog.offRouteM))}</Text>
                                : <Text style={s.ok}>{t.tvNavOnRoute}</Text>
                        ) : null}
                        <View style={s.stats}>
                            <View style={s.stat}><Text style={s.statVal}>%{prog.pct}</Text><Text style={s.statLbl}>{t.tvNavProgress}</Text></View>
                            <View style={s.stat}><Text style={s.statVal}>{fmtKm(prog.progressM)}</Text><Text style={s.statLbl}>{t.tvLegendDone}</Text></View>
                            <View style={s.stat}><Text style={s.statVal}>{fmtKm(prog.remainingM)}</Text><Text style={s.statLbl}>{t.tvNavRemaining}</Text></View>
                        </View>
                        <View style={s.bar}><View style={[s.barFill, { width: `${prog.pct}%` }]} /></View>
                    </>
                ) : null}

                {off && !approach && !prog?.arrived ? (
                    <View style={s.btnRow}>
                        {far ? (
                            <>
                                <TouchableOpacity style={[s.btn, s.btnWarm]} onPress={() => getDirections('car', 'start')} disabled={approachLoading}>
                                    <Text style={[s.btnText, { color: APPROACH }]}>🚗 {t.tvGoToStart}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.btn, s.btnWarm]} onPress={() => getDirections('foot', 'nearest')} disabled={approachLoading}>
                                    <Text style={[s.btnText, { color: APPROACH }]}>🚶 {t.tvBackToRoute}</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <TouchableOpacity style={[s.btn, s.btnWarm]} onPress={() => getDirections('foot', 'nearest')} disabled={approachLoading}>
                                <Text style={[s.btnText, { color: APPROACH }]}>🚶 {t.tvBackToRoute}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : null}
                {approachLoading ? <ActivityIndicator color={APPROACH} style={{ marginTop: 8 }} /> : null}

                <View style={s.btnRow}>
                    <TouchableOpacity style={[s.btn, bgOn && s.btnActive]} onPress={toggleBackground}>
                        <Text style={[s.btnText, bgOn && { color: '#fff' }]}>⌚ {bgOn ? t.tvNavStop : t.tvNavBackground}</Text>
                    </TouchableOpacity>
                </View>
                <Text style={s.attr}>© OpenStreetMap · OSRM</Text>
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
    sideBtns:  { position: 'absolute', right: 14, gap: 10 },
    sideBtn:   { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    sideIcon:  { fontSize: 18 },
    panel:     { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border },
    legend:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    legendItem:{ fontSize: 11, fontWeight: '800' },
    warn:      { color: '#f97316', fontWeight: '900', fontSize: 14, marginBottom: 8 },
    ok:        { color: '#22c55e', fontWeight: '900', fontSize: 14, marginBottom: 8 },
    arrived:   { color: '#22c55e', fontWeight: '900', fontSize: 18, marginBottom: 8, textAlign: 'center' },
    muted:     { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    approachBox:{ flexDirection: 'row', alignItems: 'center', backgroundColor: `${APPROACH}18`, borderColor: `${APPROACH}66`, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 10 },
    approachTitle:{ color: APPROACH, fontWeight: '900', fontSize: 14 },
    closeBtn:  { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0003' },
    closeText: { color: colors.text, fontWeight: '900' },
    stats:     { flexDirection: 'row', justifyContent: 'space-between' },
    stat:      { flex: 1, alignItems: 'center' },
    statVal:   { color: colors.text, fontWeight: '900', fontSize: 17 },
    statLbl:   { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    bar:       { height: 6, borderRadius: 3, backgroundColor: colors.surface2, marginTop: 10, overflow: 'hidden' },
    barFill:   { height: 6, backgroundColor: DONE },
    btnRow:    { flexDirection: 'row', gap: 8, marginTop: 10 },
    btn:       { flex: 1, borderWidth: 1, borderColor: ACCENT, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
    btnWarm:   { borderColor: APPROACH },
    btnActive: { backgroundColor: ACCENT },
    btnText:   { color: ACCENT, fontWeight: '800', fontSize: 13 },
    attr:      { color: colors.textMuted, fontSize: 10, textAlign: 'right', marginTop: 8 },
});
