import { useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
    TextInput, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import * as Location from 'expo-location';
import { formatTripDate } from '../../utils/travelMedia';
import { listOfflineRoutes } from '../../utils/travelOffline';
import KeyboardSafeModal from '../../components/KeyboardSafeModal';
import TravelRouteCard from '../../components/TravelRouteCard';
import { travelListName, travelListIcon } from '../../components/TravelSaveToListModal';

const ACCENT = '#0ea5e9';
const DEFAULT_FILTERS = { q: '', sort: 'new', difficulty: null, minRating: 0 };

async function getHere() {
    try {
        const { granted } = await Location.requestForegroundPermissionsAsync();
        if (!granted) return null;
        const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });
        const loc = last || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch { return null; }
}

function FilterModal({ visible, value, sorts, onApply, onClose }) {
    const t = useT();
    const [f, setF] = useState(value);
    useEffect(() => { if (visible) setF(value); }, [visible, value]);
    const set = (patch) => setF(prev => ({ ...prev, ...patch }));
    const Chip = ({ active, label, onPress }) => (
        <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress}>
            <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
        </TouchableOpacity>
    );
    return (
        <KeyboardSafeModal visible={visible} onClose={onClose}>
            <View style={s.modalHead}>
                <Text style={s.modalTitle}>🔎 {t.tvFilterSearch}</Text>
                <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
                <Text style={s.fLabel}>{t.tvSearchWord}</Text>
                <TextInput
                    style={[s.search, { marginTop: 0 }]}
                    value={f.q}
                    onChangeText={(q) => set({ q })}
                    placeholder={t.tvSearchRoutes}
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="search"
                    onSubmitEditing={() => onApply(f)}
                />
                <Text style={s.fLabel}>{t.tvSortBy}</Text>
                <View style={s.chipRow}>
                    {sorts.map(([k, label]) => <Chip key={k} active={f.sort === k} label={label} onPress={() => set({ sort: k })} />)}
                </View>
                <Text style={s.fLabel}>{t.tvDifficulty}</Text>
                <View style={s.chipRow}>
                    <Chip active={!f.difficulty} label={t.tvAny} onPress={() => set({ difficulty: null })} />
                    {['EASY', 'MEDIUM', 'HARD'].map(d => <Chip key={d} active={f.difficulty === d} label={t[`tvDiff${d}`]} onPress={() => set({ difficulty: d })} />)}
                </View>
                <Text style={s.fLabel}>{t.tvMinRating}</Text>
                <View style={s.chipRow}>
                    {[0, 3, 4, 4.5].map(r => <Chip key={r} active={f.minRating === r} label={r ? `★ ${r}+` : t.tvAny} onPress={() => set({ minRating: r })} />)}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
                    <TouchableOpacity style={[s.resetBtn]} onPress={() => onApply(DEFAULT_FILTERS)}>
                        <Text style={s.resetText}>{t.tvReset}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.primaryBtn, { flex: 2, marginTop: 0 }]} onPress={() => onApply(f)}>
                        <Text style={s.primaryBtnText}>{t.tvApplyFilters}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardSafeModal>
    );
}

export default function TravelExploreHomeScreen({ navigation, route }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [tab, setTab] = useState(route?.params?.initialTab === 'travel' ? 'travel' : 'explore');
    const SORTS = [
        ['near', `📍 ${t.tvSortNear}`], ['top', `★ ${t.tvSortTop}`], ['popular', `👣 ${t.tvSortPopular}`],
        ['comments', `💬 ${t.tvSortComments}`], ['new', `🆕 ${t.tvSortNew}`],
    ];

    const [routes, setRoutes] = useState([]);
    const [scope, setScope] = useState('all');
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [filterOpen, setFilterOpen] = useState(false);
    const [myLists, setMyLists] = useState([]);
    const [newListName, setNewListName] = useState('');
    const [loadingRoutes, setLoadingRoutes] = useState(true);

    const [trips, setTrips] = useState([]);
    const [tripScope, setTripScope] = useState('all');
    const [fromQ, setFromQ] = useState('');
    const [toQ, setToQ] = useState('');
    const [loadingTrips, setLoadingTrips] = useState(true);
    const [verification, setVerification] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const searchTimer = useRef(null);

    const loadRoutes = useCallback(async (sc = scope, f = filters) => {
        try {
            if (sc === 'lists') {
                const { data } = await api.get('/travel/lists');
                setMyLists(Array.isArray(data) ? data : []);
                return;
            }
            if (sc === 'offline') {
                const list = await listOfflineRoutes();
                const term = f.q.trim().toLocaleLowerCase();
                setRoutes(term ? list.filter(r => `${r.title} ${r.startPlace}`.toLocaleLowerCase().includes(term)) : list);
                return;
            }
            const params = {
                q: f.q.trim() || undefined,
                sort: f.sort,
                difficulty: f.difficulty || undefined,
                minRating: f.minRating || undefined,
                mine: sc === 'mine' ? 'true' : undefined,
                source: sc === 'osm' ? 'OSM' : undefined,
            };
            if (f.sort === 'near') {
                const here = await getHere();
                if (!here) { Alert.alert('', t.tvNavLocationDenied); params.sort = 'new'; }
                else { params.lat = here.lat; params.lng = here.lng; }
            }
            const { data } = await api.get('/travel/routes', { params });
            setRoutes(Array.isArray(data) ? data : []);
        } catch {
            // İnternet yoksa en azından indirilen rotalar görünsün.
            setRoutes(await listOfflineRoutes());
        }
        finally { setLoadingRoutes(false); }
    }, [scope, filters, t]);

    const changeScope = (sc) => {
        setScope(sc);
        setLoadingRoutes(true);
        loadRoutes(sc, filters);
    };

    const applyFilters = (f) => {
        setFilters(f);
        setFilterOpen(false);
        setLoadingRoutes(true);
        loadRoutes(scope, f);
    };

    const createList = async () => {
        const name = newListName.trim();
        if (!name) return;
        try {
            await api.post('/travel/lists', { name });
            setNewListName('');
            loadRoutes('lists', filters);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        }
    };

    const activeFilterCount = (filters.q.trim() ? 1 : 0) + (filters.sort !== 'new' ? 1 : 0)
        + (filters.difficulty ? 1 : 0) + (filters.minRating ? 1 : 0);

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

    const renderRouteCard = (r) => (
        <TravelRouteCard key={r.id} route={r} onPress={() => navigation.navigate('TravelRouteDetail', { routeId: r.id })} />
    );

    const sortLabel = SORTS.find(([k]) => k === filters.sort)?.[1];

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
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scopeRow}>
                            {[['all', t.tvScopeAll], ['osm', t.tvReadyRoutes], ['mine', t.tvMine], ['lists', t.tvMyLists], ['offline', t.tvDownloaded]].map(([k, label]) => (
                                <TouchableOpacity key={k} style={[s.chip, scope === k && s.chipActive]} onPress={() => changeScope(k)}>
                                    <Text style={[s.chipText, scope === k && s.chipTextActive]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {scope !== 'lists' ? (
                            <TouchableOpacity style={s.filterBtn} onPress={() => setFilterOpen(true)} activeOpacity={0.85}>
                                <Text style={s.filterBtnText}>🔎 {t.tvFilterSearch}{activeFilterCount ? ` (${activeFilterCount})` : ''}</Text>
                                <Text style={s.filterSummary} numberOfLines={1}>
                                    {filters.q.trim() ? `“${filters.q.trim()}” · ` : ''}{sortLabel}
                                </Text>
                            </TouchableOpacity>
                        ) : null}

                        {scope === 'lists' ? (
                            <>
                                <Text style={s.section}>{t.tvMyLists}</Text>
                                {loadingRoutes ? <ActivityIndicator color={ACCENT} style={{ marginTop: 30 }} /> : myLists.map(l => (
                                    <TouchableOpacity key={l.id} style={s.listCard} onPress={() => navigation.navigate('TravelList', { listId: l.id })} activeOpacity={0.85}>
                                        <Text style={{ fontSize: 26 }}>{travelListIcon(l)}</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.listName} numberOfLines={1}>{travelListName(l, t)}</Text>
                                            <Text style={s.cardMeta}>{t.tvListCount(l.itemCount)}</Text>
                                        </View>
                                        <Text style={s.chevron}>›</Text>
                                    </TouchableOpacity>
                                ))}
                                <Text style={[s.section, { fontSize: 14 }]}>{t.tvNewList}</Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <TextInput
                                        style={[s.search, { flex: 1, marginTop: 0 }]}
                                        value={newListName}
                                        onChangeText={setNewListName}
                                        placeholder={t.tvNewListPh}
                                        placeholderTextColor={colors.textMuted}
                                        maxLength={60}
                                        onSubmitEditing={createList}
                                        returnKeyType="done"
                                    />
                                    <TouchableOpacity style={[s.addBtn, { opacity: newListName.trim() ? 1 : 0.5 }]} onPress={createList} disabled={!newListName.trim()}>
                                        <Text style={s.addText}>+</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        ) : (
                            <>
                                <Text style={s.section}>{t.tvRoutesHeader}</Text>
                                {loadingRoutes ? <ActivityIndicator color={ACCENT} style={{ marginTop: 30 }} />
                                    : routes.length === 0 ? <Text style={s.empty}>{scope === 'offline' ? t.tvNoDownloads : scope === 'osm' && !activeFilterCount ? t.tvReadyRoutesEmpty : t.tvNoRoutes}</Text>
                                    : routes.map(renderRouteCard)}
                            </>
                        )}
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
            <FilterModal visible={filterOpen} value={filters} sorts={SORTS} onApply={applyFilters} onClose={() => setFilterOpen(false)} />
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
    scopeRow:  { gap: 8, paddingVertical: 2, marginTop: 12 },
    filterBtn: { backgroundColor: colors.surface, borderColor: `${ACCENT}88`, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginTop: 12 },
    filterBtnText: { color: ACCENT, fontWeight: '900', fontSize: 14 },
    filterSummary: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
    listCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
    listName:  { color: colors.text, fontSize: 15, fontWeight: '900' },
    chevron:   { color: colors.textMuted, fontSize: 24, fontWeight: '700' },
    addBtn:    { width: 48, borderRadius: 12, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
    addText:   { color: '#fff', fontSize: 22, fontWeight: '900' },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    modalTitle:{ color: colors.text, fontSize: 17, fontWeight: '900' },
    modalClose:{ color: colors.textMuted, fontSize: 20, fontWeight: '800', padding: 4 },
    fLabel:    { color: colors.textSecondary, fontSize: 13, fontWeight: '800', marginTop: 14, marginBottom: 6 },
    resetBtn:  { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    resetText: { color: colors.textSecondary, fontWeight: '800', fontSize: 14 },
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
