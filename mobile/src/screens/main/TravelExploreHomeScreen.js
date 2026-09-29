import { useCallback, useRef, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
    TextInput, Image, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { formatTripDate } from '../../utils/travelMedia';

const ACCENT = '#0ea5e9';

export default function TravelExploreHomeScreen({ navigation, route }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [tab, setTab] = useState(route?.params?.initialTab === 'travel' ? 'travel' : 'explore');

    const [routes, setRoutes] = useState([]);
    const [routeSort, setRouteSort] = useState('new');
    const [routeQuery, setRouteQuery] = useState('');
    const [loadingRoutes, setLoadingRoutes] = useState(true);

    const [trips, setTrips] = useState([]);
    const [tripScope, setTripScope] = useState('all');
    const [fromQ, setFromQ] = useState('');
    const [toQ, setToQ] = useState('');
    const [loadingTrips, setLoadingTrips] = useState(true);
    const [verification, setVerification] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const searchTimer = useRef(null);

    const loadRoutes = useCallback(async (sort = routeSort, q = routeQuery) => {
        try {
            const params = sort === 'mine' ? { mine: 'true' } : { sort, q: q.trim() || undefined };
            const { data } = await api.get('/travel/routes', { params });
            setRoutes(Array.isArray(data) ? data : []);
        } catch { setRoutes([]); }
        finally { setLoadingRoutes(false); }
    }, [routeSort, routeQuery]);

    const loadTrips = useCallback(async (scope = tripScope, from = fromQ, to = toQ) => {
        try {
            const params = scope === 'mine' ? { mine: 'true' } : { from: from.trim() || undefined, to: to.trim() || undefined };
            const [{ data }, { data: v }] = await Promise.all([
                api.get('/travel/trips', { params }),
                api.get('/travel/verification'),
            ]);
            setTrips(Array.isArray(data) ? data : []);
            setVerification(v || null);
        } catch { setTrips([]); }
        finally { setLoadingTrips(false); }
    }, [tripScope, fromQ, toQ]);

    useFocusEffect(useCallback(() => {
        loadRoutes();
        loadTrips();
    }, [loadRoutes, loadTrips]));

    const onRefresh = async () => {
        setRefreshing(true);
        await (tab === 'explore' ? loadRoutes() : loadTrips());
        setRefreshing(false);
    };

    const debounced = (fn) => {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(fn, 350);
    };

    const onCreateTrip = () => {
        if (verification?.status === 'APPROVED') navigation.navigate('TravelTripCreate');
        else navigation.navigate('TravelVerification');
    };

    const renderRouteCard = (r) => {
        const cover = (r.media || []).find(m => m.type === 'image');
        const hasVideo = (r.media || []).some(m => m.type === 'video');
        return (
            <TouchableOpacity key={r.id} style={s.card} activeOpacity={0.85} onPress={() => navigation.navigate('TravelRouteDetail', { routeId: r.id })}>
                {cover ? (
                    <Image source={{ uri: cover.url }} style={s.cover} />
                ) : (
                    <View style={[s.cover, s.coverEmpty]}><Text style={{ fontSize: 34 }}>{hasVideo ? '🎬' : '🗺️'}</Text></View>
                )}
                <View style={s.cardBody}>
                    <Text style={s.cardTitle} numberOfLines={1}>{r.title}</Text>
                    <Text style={s.cardMeta} numberOfLines={1}>📍 {r.startPlace}{r.endPlace ? ` → ${r.endPlace}` : ''}</Text>
                    <View style={s.rowBetween}>
                        <Text style={s.rating}>★ {r.ratingCount ? r.ratingAvg.toFixed(1) : '—'} <Text style={s.cardMeta}>({t.tvRatingCount(r.ratingCount || 0)})</Text></Text>
                        {r.difficulty ? <Text style={s.chipSmall}>{t[`tvDiff${r.difficulty}`]}</Text> : null}
                    </View>
                    <Text style={s.cardMeta} numberOfLines={1}>{t.tvByUser(r.user?.fullName || r.user?.username || '')}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderTripCard = (tr) => (
        <TouchableOpacity key={tr.id} style={s.tripCard} activeOpacity={0.85} onPress={() => navigation.navigate('TravelTripDetail', { tripId: tr.id })}>
            <View style={s.rowBetween}>
                <Text style={s.tripRoute} numberOfLines={1}>{tr.fromPlace} → {tr.toPlace}</Text>
                {tr.status === 'CANCELLED'
                    ? <Text style={[s.chipSmall, { color: colors.red, borderColor: colors.red }]}>{t.tvTripCancelled}</Text>
                    : <Text style={s.price}>{tr.pricePerSeat > 0 ? t.tvPerSeat(tr.pricePerSeat) : t.tvFree}</Text>}
            </View>
            {tr.waypoints?.length ? <Text style={s.cardMeta} numberOfLines={1}>↳ {tr.waypoints.join(' · ')}</Text> : null}
            <Text style={s.cardMeta}>🕒 {formatTripDate(tr.departAt)}</Text>
            <View style={s.rowBetween}>
                <Text style={s.cardMeta} numberOfLines={1}>
                    👤 {tr.user?.fullName || tr.user?.username}{tr.user?.travelVerified ? `  ${t.tvVerifiedBadge}` : ''}
                </Text>
                <Text style={s.seats}>{t.tvSeatsLeft(tr.seatsLeft)}</Text>
            </View>
            {tr.requestCount > 0 ? <Text style={s.reqBadge}>🔔 {t.tvRequests}: {tr.requestCount}</Text> : null}
            {tr.myRequest ? <Text style={s.myReq}>{t[`tvReqStatus${tr.myRequest.status}`]}</Text> : null}
        </TouchableOpacity>
    );

    const verifyBanner = () => {
        if (verification?.status === 'APPROVED') return <Text style={s.okBanner}>{t.tvVerifyApproved}</Text>;
        const text = verification?.status === 'PENDING' ? t.tvVerifyPending
            : verification?.status === 'REJECTED' ? t.tvVerifyRejected(verification.adminNote)
            : t.tvVerifyBanner;
        return (
            <TouchableOpacity style={s.warnBanner} onPress={() => navigation.navigate('TravelVerification')} activeOpacity={0.85}>
                <Text style={s.warnText}>🛡️ {text}</Text>
                {verification?.status !== 'PENDING' ? <Text style={s.warnBtn}>{t.tvVerifyBtn} →</Text> : null}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[s.container, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.backText}>{t.back}</Text></TouchableOpacity>
                <Text style={s.title} numberOfLines={1}>{t.tvTitle}</Text>
                <View style={{ width: 50 }} />
            </View>

            <View style={s.tabs}>
                {[['explore', t.tvTabExplore], ['travel', t.tvTabTravel]].map(([k, label]) => (
                    <TouchableOpacity key={k} style={[s.tab, tab === k && s.tabActive]} onPress={() => setTab(k)}>
                        <Text style={[s.tabText, tab === k && s.tabTextActive]} numberOfLines={1}>{label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 90 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
            >
                {tab === 'explore' ? (
                    <>
                        <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.navigate('TravelRouteCreate')}>
                            <Text style={s.primaryBtnText}>{t.tvCreateRoute}</Text>
                        </TouchableOpacity>
                        <TextInput
                            style={s.search}
                            value={routeQuery}
                            onChangeText={(v) => { setRouteQuery(v); debounced(() => loadRoutes(routeSort === 'mine' ? 'new' : routeSort, v)); }}
                            placeholder={t.tvSearchRoutes}
                            placeholderTextColor={colors.textMuted}
                        />
                        <View style={s.chipRow}>
                            {[['new', t.tvSortNew], ['top', t.tvSortTop], ['mine', t.tvMine]].map(([k, label]) => (
                                <TouchableOpacity key={k} style={[s.chip, routeSort === k && s.chipActive]} onPress={() => { setRouteSort(k); setLoadingRoutes(true); loadRoutes(k, routeQuery); }}>
                                    <Text style={[s.chipText, routeSort === k && s.chipTextActive]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={s.section}>{t.tvRoutesHeader}</Text>
                        {loadingRoutes ? <ActivityIndicator color={ACCENT} style={{ marginTop: 30 }} />
                            : routes.length === 0 ? <Text style={s.empty}>{t.tvNoRoutes}</Text>
                            : routes.map(renderRouteCard)}
                    </>
                ) : (
                    <>
                        {verifyBanner()}
                        <TouchableOpacity style={s.primaryBtn} onPress={onCreateTrip}>
                            <Text style={s.primaryBtnText}>{t.tvCreateTrip}</Text>
                        </TouchableOpacity>
                        <View style={s.chipRow}>
                            {[['all', t.tvAllTrips], ['mine', t.tvMyTrips]].map(([k, label]) => (
                                <TouchableOpacity key={k} style={[s.chip, tripScope === k && s.chipActive]} onPress={() => { setTripScope(k); setLoadingTrips(true); loadTrips(k); }}>
                                    <Text style={[s.chipText, tripScope === k && s.chipTextActive]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {tripScope === 'all' && (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TextInput
                                    style={[s.search, { flex: 1 }]}
                                    value={fromQ}
                                    onChangeText={(v) => { setFromQ(v); debounced(() => loadTrips('all', v, toQ)); }}
                                    placeholder={t.tvFrom}
                                    placeholderTextColor={colors.textMuted}
                                />
                                <TextInput
                                    style={[s.search, { flex: 1 }]}
                                    value={toQ}
                                    onChangeText={(v) => { setToQ(v); debounced(() => loadTrips('all', fromQ, v)); }}
                                    placeholder={t.tvTo}
                                    placeholderTextColor={colors.textMuted}
                                />
                            </View>
                        )}
                        {loadingTrips ? <ActivityIndicator color={ACCENT} style={{ marginTop: 30 }} />
                            : trips.length === 0 ? <Text style={s.empty}>{t.tvNoTrips}</Text>
                            : trips.map(renderTripCard)}
                    </>
                )}
            </ScrollView>
        </View>
    );
}

export const travelStyles = StyleSheet.create({
    label:     { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 6 },
    input:     { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14 },
    primaryBtn:{ backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
    primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
    chip:      { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
    chipActive:{ borderColor: ACCENT, backgroundColor: `${ACCENT}22` },
    chipText:  { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: ACCENT },
    header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
    backText:  { color: colors.purple, fontSize: 15, fontWeight: '700' },
    title:     { color: colors.text, fontSize: 17, fontWeight: '900', flex: 1, textAlign: 'center' },
});

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header:    travelStyles.header,
    backText:  travelStyles.backText,
    title:     travelStyles.title,
    tabs:      { flexDirection: 'row', marginHorizontal: 16, backgroundColor: colors.surface, borderRadius: 14, padding: 4, marginBottom: 6 },
    tab:       { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    tabActive: { backgroundColor: `${ACCENT}26` },
    tabText:   { color: colors.textSecondary, fontWeight: '800', fontSize: 13 },
    tabTextActive: { color: ACCENT },
    primaryBtn: travelStyles.primaryBtn,
    primaryBtnText: travelStyles.primaryBtnText,
    search:    { ...travelStyles.input, marginTop: 12 },
    chipRow:   { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
    chip:      travelStyles.chip,
    chipActive: travelStyles.chipActive,
    chipText:  travelStyles.chipText,
    chipTextActive: travelStyles.chipTextActive,
    section:   { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 18, marginBottom: 8 },
    empty:     { color: colors.textMuted, textAlign: 'center', marginTop: 30, fontSize: 14 },
    card:      { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 10, overflow: 'hidden' },
    cover:     { width: 104, height: 110 },
    coverEmpty:{ backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    cardBody:  { flex: 1, padding: 10, gap: 3 },
    cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
    cardMeta:  { color: colors.textMuted, fontSize: 12 },
    rowBetween:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    rating:    { color: '#facc15', fontSize: 13, fontWeight: '800' },
    chipSmall: { color: ACCENT, borderColor: ACCENT, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, fontSize: 10, fontWeight: '800' },
    tripCard:  { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, marginTop: 10, gap: 4 },
    tripRoute: { color: colors.text, fontSize: 15, fontWeight: '900', flex: 1 },
    price:     { color: '#22c55e', fontWeight: '900', fontSize: 13 },
    seats:     { color: ACCENT, fontWeight: '800', fontSize: 12 },
    reqBadge:  { color: '#f59e0b', fontSize: 12, fontWeight: '800' },
    myReq:     { color: ACCENT, fontSize: 12, fontWeight: '800' },
    okBanner:  { color: '#22c55e', backgroundColor: '#22c55e18', borderRadius: 12, padding: 10, marginTop: 8, fontSize: 13, fontWeight: '700' },
    warnBanner:{ backgroundColor: '#f59e0b18', borderColor: '#f59e0b66', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8, gap: 6 },
    warnText:  { color: '#fbbf24', fontSize: 13, fontWeight: '700' },
    warnBtn:   { color: ACCENT, fontSize: 13, fontWeight: '900' },
});
