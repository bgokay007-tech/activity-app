import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, ScrollView, FlatList, TouchableOpacity,
    TextInput, ActivityIndicator, Alert, StyleSheet,
    RefreshControl, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import colors from '../../theme/colors';

const TABS = [
    { key: 'dashboard',        label: '📊 Dashboard' },
    { key: 'users',            label: '👥 Kullanıcılar' },
    { key: 'courts',           label: '🏟️ Kortlar' },
    { key: 'disputes',         label: '⚠️ Anlaşmazlık' },
    { key: 'posts',            label: '📝 Gönderiler' },
    { key: 'venues',           label: '🏗️ Tesis' },
    { key: 'noshow',           label: '🚫 No-Show' },
    { key: 'cities',           label: '📍 Şehirler' },
    { key: 'tourperms',        label: '🏆 Turnuva' },
    { key: 'flagged',          label: '🚩 İlanlar' },
    { key: 'profilechanges',   label: '🪪 Profil' },
    { key: 'subscriptions',    label: '💳 Abonelik' },
    { key: 'venuereviews',     label: '⭐ Tesis Yorumu' },
];

// ── Shared helpers ────────────────────────────────────────────────────────────────

function LoadingView() {
    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 }}>
            <ActivityIndicator size="large" color={colors.purple} />
        </View>
    );
}

function EmptyView({ text }) {
    return (
        <View style={{ alignItems: 'center', paddingVertical: 50 }}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>{text}</Text>
        </View>
    );
}

function SearchBar({ value, onChangeText, placeholder }) {
    return (
        <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
            <TextInput
                style={s.searchInput}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
            />
        </View>
    );
}

function FilterRow({ options, active, onChange }) {
    return (
        <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={options}
            keyExtractor={o => o.key}
            style={{ maxHeight: 46 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
            renderItem={({ item: o }) => (
                <TouchableOpacity
                    style={[s.filterBtn, active === o.key && s.filterBtnActive]}
                    onPress={() => onChange(o.key)}
                >
                    <Text style={[s.filterBtnText, active === o.key && s.filterBtnTextActive]}>{o.label}</Text>
                </TouchableOpacity>
            )}
        />
    );
}

function AdminInput({ label, value, onChangeText }) {
    return (
        <View style={{ marginBottom: 6 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 3 }}>{label}</Text>
            <TextInput
                style={s.input}
                value={value ?? ''}
                onChangeText={onChangeText}
                placeholderTextColor={colors.textMuted}
            />
        </View>
    );
}

function Btn({ label, onPress, color, small, flex }) {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={{
                backgroundColor: color + '22',
                borderRadius: 8,
                paddingVertical: small ? 5 : 9,
                paddingHorizontal: small ? 10 : 16,
                borderWidth: 1,
                borderColor: color + '60',
                flex: flex ? 1 : undefined,
                alignItems: 'center',
            }}
        >
            <Text style={{ color, fontSize: small ? 12 : 14, fontWeight: '700' }}>{label}</Text>
        </TouchableOpacity>
    );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────────
function DashboardTab() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/admin/stats')
            .then(({ data }) => setStats(data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <LoadingView />;
    if (!stats) return <EmptyView text="İstatistikler yüklenemedi." />;

    const items = [
        { label: 'Toplam Kullanıcı',  value: stats.totalUsers,       color: '#a855f7' },
        { label: 'Toplam Maç',         value: stats.totalMatches,      color: '#3b82f6' },
        { label: 'Onaylı Maç',         value: stats.archivedMatches,   color: '#10b981' },
        { label: 'Toplam Kort',         value: stats.totalCourts,       color: '#f59e0b' },
        { label: 'Anlaşmazlık',         value: stats.disputedMatches,   color: '#ef4444' },
        { label: 'Bekleyen Tesis',      value: stats.pendingVenues,     color: '#f97316' },
        { label: 'Toplam Gönderi',      value: stats.totalPosts,        color: '#6366f1' },
    ];

    return (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
            {items.map(({ label, value, color }) => (
                <View key={label} style={[s.statCard, { borderLeftColor: color }]}>
                    <Text style={s.statLabel}>{label}</Text>
                    <Text style={[s.statValue, { color }]}>{value ?? '–'}</Text>
                </View>
            ))}
        </ScrollView>
    );
}

// ── Users ─────────────────────────────────────────────────────────────────────────
function UsersTab() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const { data } = await api.get('/admin/users');
            setUsers(Array.isArray(data) ? data : (data.users || []));
        } catch {}
        if (isRefresh) setRefreshing(false); else setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const toggleAdmin = async (user) => {
        try {
            await api.patch(`/admin/users/${user.id}`, { isAdmin: !user.isAdmin });
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isAdmin: !u.isAdmin } : u));
        } catch { Alert.alert('Hata', 'İşlem başarısız.'); }
    };

    const deleteUser = (user) => {
        Alert.alert('Kullanıcı Sil', `@${user.username} silinsin mi? Bu işlem geri alınamaz.`, [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Sil', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/admin/users/${user.id}`);
                    setUsers(prev => prev.filter(u => u.id !== user.id));
                } catch { Alert.alert('Hata', 'Silinemedi.'); }
            }},
        ]);
    };

    const filtered = users.filter(u =>
        (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <LoadingView />;

    return (
        <View style={{ flex: 1 }}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Kullanıcı adı veya e-posta..." />
            <FlatList
                data={filtered}
                keyExtractor={u => u.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.purple} />}
                renderItem={({ item: u }) => (
                    <View style={s.card}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle}>@{u.username} {u.isAdmin ? '👑' : ''}</Text>
                            <Text style={s.cardMeta}>{u.email || u.phone || '—'}</Text>
                            <Text style={s.cardMeta}>{u._count?.posts ?? 0} gönderi · {((u._count?.sentFriendReqs ?? 0) + (u._count?.receivedFriendReqs ?? 0))} arkadaş</Text>
                        </View>
                        <View style={s.actionCol}>
                            <Btn label={u.isAdmin ? '👑 Admin' : 'Admin Yap'} onPress={() => toggleAdmin(u)} color="#f59e0b" small />
                            <Btn label="🗑 Sil" onPress={() => deleteUser(u)} color="#ef4444" small />
                        </View>
                    </View>
                )}
                ListEmptyComponent={<EmptyView text="Kullanıcı bulunamadı." />}
            />
        </View>
    );
}

// ── Courts ────────────────────────────────────────────────────────────────────────
function CourtsTab() {
    const [courts, setCourts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const { data } = await api.get('/admin/courts');
            setCourts(Array.isArray(data) ? data : (data.courts || []));
        } catch {}
        if (isRefresh) setRefreshing(false); else setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const deleteCourt = (court) => {
        Alert.alert('Kort Sil', `"${court.name}" silinsin mi?`, [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Sil', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/admin/courts/${court.id}`);
                    setCourts(prev => prev.filter(c => c.id !== court.id));
                } catch { Alert.alert('Hata', 'Silinemedi.'); }
            }},
        ]);
    };

    const filtered = courts.filter(c =>
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.city || '').toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <LoadingView />;

    return (
        <View style={{ flex: 1 }}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Kort adı veya şehir..." />
            <FlatList
                data={filtered}
                keyExtractor={c => c.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.purple} />}
                renderItem={({ item: c }) => (
                    <View style={s.card}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle}>{c.name} {c.isVerified ? '✅' : '⏳'}</Text>
                            <Text style={s.cardMeta}>{c.city} — {c.sport} · {c.surface}</Text>
                            <Text style={s.cardMeta}>{c.indoor ? '🏠 Kapalı' : '☀️ Açık'}{c.hasLights ? ' · 💡 Işıklı' : ''}</Text>
                        </View>
                        <Btn label="🗑 Sil" onPress={() => deleteCourt(c)} color="#ef4444" small />
                    </View>
                )}
                ListEmptyComponent={<EmptyView text="Kort bulunamadı." />}
            />
        </View>
    );
}

// ── Disputes ──────────────────────────────────────────────────────────────────────
function DisputesTab() {
    const [disputes, setDisputes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const { data } = await api.get('/admin/disputes');
            setDisputes(Array.isArray(data) ? data : (data.disputes || []));
        } catch {}
        if (isRefresh) setRefreshing(false); else setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const resolve = async (id, winner) => {
        try {
            await api.patch(`/admin/disputes/${id}/resolve`, { winner });
            setDisputes(prev => prev.filter(d => d.id !== id));
        } catch { Alert.alert('Hata', 'Çözüm kaydedilemedi.'); }
    };

    const resolveAppeal = async (id, resolution) => {
        try {
            await api.patch(`/admin/disputes/${id}/resolve-appeal`, { resolution });
            setDisputes(prev => prev.filter(d => d.id !== id));
        } catch { Alert.alert('Hata', 'İtiraz çözülemedi.'); }
    };

    if (loading) return <LoadingView />;

    const appeals = disputes.filter(d => d.scoreAppeal);
    const regularDisputes = disputes.filter(d => !d.scoreAppeal && d.scoreStatus === 'DISPUTED');

    return (
        <FlatList
            data={disputes}
            keyExtractor={d => d.id}
            contentContainerStyle={{ padding: 12 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.purple} />}
            renderItem={({ item: d }) => {
                const sets = d.score?.sets || [];
                const isAppeal = d.scoreAppeal;
                return (
                    <View style={[s.card, { flexDirection: 'column', gap: 8 }, isAppeal && { borderLeftWidth: 3, borderLeftColor: '#f97316' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={s.cardTitle}>{d.subCategory || d.category || 'Maç'}</Text>
                            {isAppeal && (
                                <View style={{ backgroundColor: '#f9731620', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                    <Text style={{ color: '#f97316', fontSize: 11, fontWeight: '700' }}>⚠️ İtiraz</Text>
                                </View>
                            )}
                        </View>
                        <Text style={s.cardMeta}>Maç ID: {d.id?.slice(0, 8)}...</Text>
                        <Text style={s.cardMeta}>Gönderen: @{d.sender?.username || '?'}</Text>
                        <Text style={s.cardMeta}>Alıcı: @{d.receiver?.username || (d.participants?.[0]?.username) || '?'}</Text>
                        {sets.length > 0 && (
                            <Text style={s.cardMeta}>Skor: {sets.map(st => `${st.sender ?? st.p1 ?? 0}-${st.opponent ?? st.p2 ?? 0}`).join(', ')}</Text>
                        )}
                        {isAppeal ? (
                            <>
                                {d.scoreAppealReason ? (
                                    <Text style={[s.cardMeta, { color: '#f97316' }]}>İtiraz Nedeni: {d.scoreAppealReason}</Text>
                                ) : null}
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <Btn label="🔄 Sıfırla" onPress={() => resolveAppeal(d.id, 'RESET')} color="#f97316" small />
                                    <Btn label="❌ Reddet" onPress={() => resolveAppeal(d.id, 'REJECTED')} color="#6b7280" small />
                                </View>
                            </>
                        ) : (
                            <>
                                <Text style={s.cardMeta}>İddia: {d.score?.winner === 'sender' ? 'Gönderen kazandı' : 'Alıcı kazandı'}</Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <Btn label="🏆 Gönderen" onPress={() => resolve(d.id, 'sender')} color="#10b981" small />
                                    <Btn label="🤝 Berabere" onPress={() => resolve(d.id, 'draw')} color="#6366f1" small />
                                    <Btn label="🏆 Alıcı" onPress={() => resolve(d.id, 'receiver')} color="#3b82f6" small />
                                </View>
                            </>
                        )}
                    </View>
                );
            }}
            ListEmptyComponent={<EmptyView text="Bekleyen anlaşmazlık veya itiraz yok. ✅" />}
        />
    );
}

// ── Posts ─────────────────────────────────────────────────────────────────────────
function PostsTab() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const { data } = await api.get('/admin/posts');
            setPosts(Array.isArray(data) ? data : (data.posts || []));
        } catch {}
        if (isRefresh) setRefreshing(false); else setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const deletePost = (post) => {
        Alert.alert('Gönderi Sil', 'Bu gönderi silinsin mi?', [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Sil', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/admin/posts/${post.id}`);
                    setPosts(prev => prev.filter(p => p.id !== post.id));
                } catch { Alert.alert('Hata', 'Silinemedi.'); }
            }},
        ]);
    };

    const filtered = posts.filter(p =>
        (p.content || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.user?.username || '').toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <LoadingView />;

    return (
        <View style={{ flex: 1 }}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="İçerik veya kullanıcı..." />
            <FlatList
                data={filtered}
                keyExtractor={p => p.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.purple} />}
                renderItem={({ item: p }) => (
                    <View style={s.card}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle}>@{p.user?.username || '?'}</Text>
                            <Text style={s.cardMeta} numberOfLines={2}>{p.content || '(Görsel gönderi)'}</Text>
                            <Text style={s.cardMeta}>{p.type} {p.isHidden ? '· 🙈 Gizli' : '· 👁 Görünür'}</Text>
                        </View>
                        <Btn label="🗑 Sil" onPress={() => deletePost(p)} color="#ef4444" small />
                    </View>
                )}
                ListEmptyComponent={<EmptyView text="Gönderi bulunamadı." />}
            />
        </View>
    );
}

// ── Venues ────────────────────────────────────────────────────────────────────────
function VenuesTab() {
    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [rejectId, setRejectId] = useState(null);
    const [rejectReason, setRejectReason] = useState('');

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const { data } = await api.get('/venues/admin/pending');
            setVenues(Array.isArray(data) ? data : []);
        } catch {}
        if (isRefresh) setRefreshing(false); else setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const approve = async (v) => {
        try {
            await api.patch(`/venues/${v.id}/approve`);
            setVenues(prev => prev.filter(x => x.id !== v.id));
        } catch { Alert.alert('Hata', 'Onaylanamadı.'); }
    };

    const reject = async () => {
        try {
            await api.patch(`/venues/${rejectId}/reject`, { adminNote: rejectReason });
            setVenues(prev => prev.filter(v => v.id !== rejectId));
            setRejectId(null);
            setRejectReason('');
        } catch { Alert.alert('Hata', 'Reddedilemedi.'); }
    };

    if (loading) return <LoadingView />;

    return (
        <>
            <FlatList
                data={venues}
                keyExtractor={v => v.id}
                contentContainerStyle={{ padding: 12 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.purple} />}
                renderItem={({ item: v }) => (
                    <View style={[s.card, { flexDirection: 'column', gap: 8 }]}>
                        <Text style={s.cardTitle}>{v.name}</Text>
                        <Text style={s.cardMeta}>{v.city} — {v.branch} · {v.courts?.length ?? 0} kort</Text>
                        <Text style={s.cardMeta}>Gönderen: {v.user?.businessName || (v.user?.username ? '@' + v.user.username : '?')}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                            <Btn label="✅ Onayla" onPress={() => approve(v)} color="#10b981" small />
                            <Btn label="✕ Reddet" onPress={() => setRejectId(v.id)} color="#ef4444" small />
                        </View>
                    </View>
                )}
                ListEmptyComponent={<EmptyView text="Bekleyen tesis yok. ✅" />}
            />
            <Modal visible={!!rejectId} transparent animationType="fade" onRequestClose={() => setRejectId(null)}>
                <View style={s.overlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>Ret Nedeni</Text>
                        <TextInput
                            style={s.textArea}
                            placeholder="Ret nedeni (opsiyonel)..."
                            placeholderTextColor={colors.textMuted}
                            value={rejectReason}
                            onChangeText={setRejectReason}
                            multiline
                        />
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                            <Btn label="Vazgeç" onPress={() => setRejectId(null)} color={colors.textMuted} flex />
                            <Btn label="Reddet" onPress={reject} color="#ef4444" flex />
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

// ── No-Show ───────────────────────────────────────────────────────────────────────
function NoShowTab() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const { data } = await api.get('/admin/no-show-reports');
            setReports(Array.isArray(data) ? data : []);
        } catch {}
        if (isRefresh) setRefreshing(false); else setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const approve = async (id) => {
        try {
            await api.patch(`/admin/no-show-reports/${id}/approve`);
            setReports(prev => prev.filter(r => r.id !== id));
        } catch { Alert.alert('Hata', 'İşlem başarısız.'); }
    };

    const reject = async (id) => {
        try {
            await api.patch(`/admin/no-show-reports/${id}/reject`);
            setReports(prev => prev.filter(r => r.id !== id));
        } catch { Alert.alert('Hata', 'İşlem başarısız.'); }
    };

    if (loading) return <LoadingView />;

    return (
        <FlatList
            data={reports}
            keyExtractor={r => r.id}
            contentContainerStyle={{ padding: 12 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.purple} />}
            renderItem={({ item: r }) => (
                <View style={[s.card, { flexDirection: 'column', gap: 8 }]}>
                    <Text style={s.cardTitle}>{r.subCategory || r.sport || 'Maç'}</Text>
                    <Text style={s.cardMeta}>Şikayetçi: @{r.reporter?.username || '?'}</Text>
                    <Text style={s.cardMeta}>Gelmeyen: {(r.absentUsers || []).map(u => '@' + (u.username || u.userId)).join(', ') || '—'}</Text>
                    {r.matchDate && <Text style={s.cardMeta}>Tarih: {new Date(r.matchDate).toLocaleDateString('tr-TR')}</Text>}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Btn label="✅ Onayla (−0.40)" onPress={() => approve(r.id)} color="#10b981" small />
                        <Btn label="✕ Reddet" onPress={() => reject(r.id)} color="#ef4444" small />
                    </View>
                </View>
            )}
            ListEmptyComponent={<EmptyView text="Bekleyen no-show raporu yok. ✅" />}
        />
    );
}

// ── Cities ────────────────────────────────────────────────────────────────────────
function CitiesTab() {
    const [cities, setCities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (st, isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const { data } = await api.get(`/admin/cities?status=${st}`);
            setCities(Array.isArray(data) ? data : []);
        } catch {}
        if (isRefresh) setRefreshing(false); else setLoading(false);
    }, []);

    useEffect(() => { load(statusFilter); }, [statusFilter]);

    const updateCity = async (id, newStatus) => {
        try {
            await api.patch(`/admin/cities/${id}`, { status: newStatus });
            setCities(prev => prev.filter(c => c.id !== id));
        } catch { Alert.alert('Hata', 'İşlem başarısız.'); }
    };

    if (loading) return <LoadingView />;

    return (
        <View style={{ flex: 1 }}>
            <FilterRow
                options={[
                    { key: 'PENDING',  label: '⏳ Bekleyen' },
                    { key: 'APPROVED', label: '✅ Onaylı' },
                ]}
                active={statusFilter}
                onChange={setStatusFilter}
            />
            <FlatList
                data={cities}
                keyExtractor={c => c.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(statusFilter, true)} tintColor={colors.purple} />}
                renderItem={({ item: c }) => (
                    <View style={s.card}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle}>{c.province}{c.district ? ` / ${c.district}` : ''}</Text>
                            <Text style={s.cardMeta}>{new Date(c.createdAt).toLocaleDateString('tr-TR')}</Text>
                        </View>
                        {statusFilter === 'PENDING' && (
                            <View style={s.actionCol}>
                                <Btn label="✅" onPress={() => updateCity(c.id, 'APPROVED')} color="#10b981" small />
                                <Btn label="✕"  onPress={() => updateCity(c.id, 'REJECTED')} color="#ef4444" small />
                            </View>
                        )}
                    </View>
                )}
                ListEmptyComponent={<EmptyView text={statusFilter === 'PENDING' ? 'Bekleyen şehir yok. ✅' : 'Onaylı şehir bulunamadı.'} />}
            />
        </View>
    );
}

// ── Tournament Permissions ────────────────────────────────────────────────────────
function TourPermsTab() {
    const [reqs, setReqs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('PENDING');
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const { data } = await api.get('/admin/tournament-permissions');
            setReqs(Array.isArray(data) ? data : []);
        } catch {}
        if (isRefresh) setRefreshing(false); else setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const approve = async (userId) => {
        try {
            await api.patch(`/admin/tournament-permissions/${userId}/approve`);
            load();
        } catch { Alert.alert('Hata', 'İşlem başarısız.'); }
    };

    const reject = async (userId) => {
        try {
            await api.patch(`/admin/tournament-permissions/${userId}/reject`);
            load();
        } catch { Alert.alert('Hata', 'İşlem başarısız.'); }
    };

    const revoke = (userId) => {
        Alert.alert('İzni İptal Et', 'Bu kullanıcının turnuva izni iptal edilsin mi?', [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'İptal Et', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/admin/tournament-permissions/${userId}/revoke`);
                    load();
                } catch { Alert.alert('Hata', 'İşlem başarısız.'); }
            }},
        ]);
    };

    const filtered = reqs.filter(r => r.status === filter);

    if (loading) return <LoadingView />;

    return (
        <View style={{ flex: 1 }}>
            <FilterRow
                options={[
                    { key: 'PENDING',  label: '⏳ Bekleyen' },
                    { key: 'APPROVED', label: '✅ İzin Verilenler' },
                ]}
                active={filter}
                onChange={setFilter}
            />
            <FlatList
                data={filtered}
                keyExtractor={r => r.userId || r.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.purple} />}
                renderItem={({ item: r }) => (
                    <View style={s.card}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle}>@{r.user?.username || '?'}</Text>
                            {r.user?.fullName ? <Text style={s.cardMeta}>{r.user.fullName}</Text> : null}
                            <Text style={s.cardMeta}>{new Date(r.createdAt).toLocaleDateString('tr-TR')}</Text>
                        </View>
                        <View style={s.actionCol}>
                            {r.status === 'PENDING' ? (
                                <>
                                    <Btn label="✓ Onayla" onPress={() => approve(r.userId)} color="#10b981" small />
                                    <Btn label="✕ Reddet" onPress={() => reject(r.userId)}  color="#ef4444" small />
                                </>
                            ) : (
                                <Btn label="🚫 İptal" onPress={() => revoke(r.userId)} color="#f59e0b" small />
                            )}
                        </View>
                    </View>
                )}
                ListEmptyComponent={<EmptyView text={filter === 'PENDING' ? 'Bekleyen talep yok. ✅' : 'İzin verilen kullanıcı bulunamadı.'} />}
            />
        </View>
    );
}

// ── Flagged Listings ──────────────────────────────────────────────────────────────
function FlaggedTab() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const { data } = await api.get('/admin/flagged-listings');
            const combined = [
                ...(data.equipment || []).map(i => ({ ...i, _type: 'equipment' })),
                ...(data.coaches   || []).map(i => ({ ...i, _type: 'coach' })),
            ].sort((a, b) => (b._count?.flags ?? 0) - (a._count?.flags ?? 0));
            setItems(combined);
        } catch {}
        if (isRefresh) setRefreshing(false); else setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const moderate = async (type, id, action) => {
        try {
            await api.patch(`/admin/listings/${type}/${id}`, { action });
            setItems(prev => prev.filter(i => !(i.id === id && i._type === type)));
        } catch { Alert.alert('Hata', 'İşlem başarısız.'); }
    };

    if (loading) return <LoadingView />;

    return (
        <FlatList
            data={items}
            keyExtractor={i => `${i._type}-${i.id}`}
            contentContainerStyle={{ padding: 12 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.purple} />}
            renderItem={({ item: i }) => (
                <View style={[s.card, { flexDirection: 'column', gap: 8 }]}>
                    <Text style={s.cardTitle}>{i._type === 'equipment' ? '🎾 Ekipman' : '🎓 Antrenör'} · {i.title || i.credentialLevel || '?'}</Text>
                    <Text style={s.cardMeta}>@{i.user?.username || '?'} · {i._count?.flags ?? 0} şikayet</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Btn label="✓ Temizle" onPress={() => moderate(i._type, i.id, 'RESTORE')} color="#10b981" small />
                        <Btn label="🗑 Kaldır"  onPress={() => moderate(i._type, i.id, 'REMOVE')}  color="#ef4444" small />
                    </View>
                </View>
            )}
            ListEmptyComponent={<EmptyView text="Şüpheli ilan yok. ✅" />}
        />
    );
}

// ── Profile Changes ───────────────────────────────────────────────────────────────
function ProfileChangesTab() {
    const [reqs, setReqs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [refreshing, setRefreshing] = useState(false);
    const [noteId, setNoteId] = useState(null);
    const [note, setNote] = useState('');

    const load = useCallback(async (st, isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const { data } = await api.get(`/admin/profile-changes?status=${st}`);
            setReqs(Array.isArray(data) ? data : []);
        } catch {}
        if (isRefresh) setRefreshing(false); else setLoading(false);
    }, []);

    useEffect(() => { load(statusFilter); }, [statusFilter]);

    const review = async (id, action) => {
        try {
            await api.patch(`/admin/profile-changes/${id}`, { action, ...(note ? { adminNote: note } : {}) });
            setReqs(prev => prev.filter(r => r.id !== id));
            setNoteId(null);
            setNote('');
        } catch { Alert.alert('Hata', 'İşlem başarısız.'); }
    };

    const FIELD_LABELS = { fullName: 'Ad Soyad', gender: 'Cinsiyet', birthDate: 'Doğum Tarihi' };

    if (loading) return <LoadingView />;

    return (
        <View style={{ flex: 1 }}>
            <FilterRow
                options={[
                    { key: 'PENDING',  label: '⏳ Bekleyen' },
                    { key: 'APPROVED', label: '✅ Onaylı' },
                    { key: 'REJECTED', label: '❌ Reddedilen' },
                ]}
                active={statusFilter}
                onChange={setStatusFilter}
            />
            <FlatList
                data={reqs}
                keyExtractor={r => r.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(statusFilter, true)} tintColor={colors.purple} />}
                renderItem={({ item: r }) => (
                    <View style={[s.card, { flexDirection: 'column', gap: 8 }]}>
                        <Text style={s.cardTitle}>@{r.user?.username || '?'} · {FIELD_LABELS[r.field] || r.field}</Text>
                        <Text style={s.cardMeta}>Mevcut: {r.currentValue || '—'}</Text>
                        <Text style={[s.cardMeta, { color: '#10b981' }]}>Yeni: {r.newValue}</Text>
                        {r.adminNote ? <Text style={[s.cardMeta, { color: '#f59e0b' }]}>Not: {r.adminNote}</Text> : null}
                        {r.documentUrl ? <Text style={[s.cardMeta, { color: '#3b82f6' }]}>📎 Belge mevcut</Text> : null}
                        {statusFilter === 'PENDING' && (
                            <>
                                {noteId === r.id && (
                                    <TextInput
                                        style={[s.textArea, { minHeight: 60 }]}
                                        placeholder="Ret notu (opsiyonel)..."
                                        placeholderTextColor={colors.textMuted}
                                        value={note}
                                        onChangeText={setNote}
                                        multiline
                                    />
                                )}
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <Btn label="✅ Onayla" onPress={() => review(r.id, 'APPROVE')} color="#10b981" small />
                                    <Btn
                                        label={noteId === r.id ? '❌ Reddet (gönder)' : '❌ Reddet'}
                                        onPress={() => noteId === r.id ? review(r.id, 'REJECT') : setNoteId(r.id)}
                                        color="#ef4444" small
                                    />
                                </View>
                            </>
                        )}
                    </View>
                )}
                ListEmptyComponent={<EmptyView text="Talep bulunamadı." />}
            />
        </View>
    );
}

// ── Venue Reviews ──────────────────────────────────────────────────────────────────
function VenueReviewsTab() {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [refreshing, setRefreshing] = useState(false);
    const [noteId, setNoteId] = useState(null);
    const [note, setNote] = useState('');

    const load = useCallback(async (st, isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const { data } = await api.get(`/admin/venue-reviews?status=${st}`);
            setReviews(Array.isArray(data) ? data : []);
        } catch {}
        if (isRefresh) setRefreshing(false); else setLoading(false);
    }, []);

    useEffect(() => { load(statusFilter); }, [statusFilter]);

    const resolve = async (id, action) => {
        try {
            await api.patch(`/admin/venue-reviews/${id}`, { action, ...(note ? { adminNote: note } : {}) });
            setReviews(prev => prev.filter(r => r.id !== id));
            setNoteId(null);
            setNote('');
        } catch { Alert.alert('Hata', 'İşlem başarısız.'); }
    };

    if (loading) return <LoadingView />;

    return (
        <View style={{ flex: 1 }}>
            <FilterRow
                options={[
                    { key: 'PENDING',  label: '⏳ Bekleyen' },
                    { key: 'APPROVED', label: '✅ Onaylı' },
                    { key: 'REJECTED', label: '❌ Reddedilen' },
                ]}
                active={statusFilter}
                onChange={setStatusFilter}
            />
            <FlatList
                data={reviews}
                keyExtractor={r => r.id}
                contentContainerStyle={{ padding: 12 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(statusFilter, true)} tintColor={colors.purple} />}
                renderItem={({ item: r }) => (
                    <View style={[s.card, { flexDirection: 'column', gap: 8 }]}>
                        <Text style={s.cardTitle}>{r.venue?.name || '?'}{r.court ? ` · ${r.court.name}` : ' · Tesis Geneli'}</Text>
                        <Text style={s.cardMeta}>@{r.user?.username || '?'} — {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                        {r.comment ? <Text style={[s.cardMeta, { color: '#e5e7eb' }]}>{r.comment}</Text> : null}
                        <Text style={s.cardMeta}>{new Date(r.createdAt).toLocaleDateString('tr-TR')}</Text>
                        {statusFilter === 'PENDING' && (
                            <>
                                {noteId === r.id && (
                                    <TextInput
                                        style={[s.textArea, { minHeight: 60 }]}
                                        placeholder="Ret notu (opsiyonel)..."
                                        placeholderTextColor={colors.textMuted}
                                        value={note}
                                        onChangeText={setNote}
                                        multiline
                                    />
                                )}
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <Btn label="✅ Onayla" onPress={() => resolve(r.id, 'APPROVE')} color="#10b981" small />
                                    <Btn
                                        label={noteId === r.id ? '❌ Reddet (gönder)' : '❌ Reddet'}
                                        onPress={() => noteId === r.id ? resolve(r.id, 'REJECT') : setNoteId(r.id)}
                                        color="#ef4444" small
                                    />
                                </View>
                            </>
                        )}
                    </View>
                )}
                ListEmptyComponent={<EmptyView text="Yorum bulunamadı." />}
            />
        </View>
    );
}

// ── Subscriptions ─────────────────────────────────────────────────────────────────
function SubscriptionsTab() {
    const [view, setView] = useState('pending');
    const [reqs, setReqs] = useState([]);
    const [activeSubs, setActiveSubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [rejectId, setRejectId] = useState(null);
    const [rejectNote, setRejectNote] = useState('');

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const [pendingRes, activeRes] = await Promise.all([
                api.get('/subscriptions/requests'),
                api.get('/subscriptions/active'),
            ]);
            setReqs(Array.isArray(pendingRes.data) ? pendingRes.data : []);
            setActiveSubs(Array.isArray(activeRes.data) ? activeRes.data : []);
        } catch {}
        if (isRefresh) setRefreshing(false); else setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const approve = async (id) => {
        try {
            await api.patch(`/subscriptions/requests/${id}/approve`);
            await load();
        } catch { Alert.alert('Hata', 'Onaylanamadı.'); }
    };

    const reject = async () => {
        try {
            await api.patch(`/subscriptions/requests/${rejectId}/reject`, rejectNote ? { adminNote: rejectNote } : {});
            setReqs(prev => prev.filter(r => r.id !== rejectId));
            setRejectId(null);
            setRejectNote('');
        } catch { Alert.alert('Hata', 'Reddedilemedi.'); }
    };

    const PACKAGE_LABELS = {
        STARTER:     'Başlangıç (399₺)',
        starter:     'Başlangıç (399₺)',
        RAHATLATICI: 'Rahatlatıcı (999₺)',
        rahatlatici: 'Rahatlatıcı (999₺)',
        PRO:         'Pro (1999₺)',
        pro:         'Pro (1999₺)',
        PREMIUM:     'Premium (2499₺)',
        premium:     'Premium (2499₺)',
    };

    const daysLeft = (endDate) => {
        const diff = new Date(endDate) - new Date();
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    };

    if (loading) return <LoadingView />;

    return (
        <>
            <FilterRow
                options={[
                    { key: 'pending', label: `⏳ Bekleyen (${reqs.length})` },
                    { key: 'active',  label: `✅ Aktif Aboneler (${activeSubs.length})` },
                ]}
                active={view}
                onChange={setView}
            />

            {view === 'pending' ? (
                <FlatList
                    data={reqs}
                    keyExtractor={r => r.id}
                    contentContainerStyle={{ padding: 12 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.purple} />}
                    renderItem={({ item: r }) => (
                        <View style={[s.card, { flexDirection: 'column', gap: 8 }]}>
                            <Text style={s.cardTitle}>{r.user?.businessName || r.user?.username || '?'}</Text>
                            <Text style={s.cardMeta}>Paket: {PACKAGE_LABELS[r.packageType] || r.packageType}</Text>
                            <Text style={s.cardMeta}>E-posta: {r.user?.email || '?'}</Text>
                            <Text style={s.cardMeta}>Makbuz: {r.receiptUrl ? '📎 Yüklendi' : '⏳ Bekleniyor'}</Text>
                            <Text style={s.cardMeta}>{new Date(r.createdAt).toLocaleDateString('tr-TR')}</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <Btn label="✅ Onayla" onPress={() => approve(r.id)} color="#10b981" small />
                                <Btn label="❌ Reddet" onPress={() => setRejectId(r.id)} color="#ef4444" small />
                            </View>
                        </View>
                    )}
                    ListEmptyComponent={<EmptyView text="Bekleyen abonelik talebi yok. ✅" />}
                />
            ) : (
                <FlatList
                    data={activeSubs}
                    keyExtractor={sub => sub.id}
                    contentContainerStyle={{ padding: 12 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.purple} />}
                    renderItem={({ item: sub }) => {
                        const left = daysLeft(sub.endDate);
                        const urgent = left <= 7;
                        return (
                            <View style={[s.card, { flexDirection: 'column', gap: 6 }]}>
                                <Text style={s.cardTitle}>{sub.user?.businessName || sub.user?.username || '?'}</Text>
                                <Text style={s.cardMeta}>@{sub.user?.username} · {sub.user?.email || '—'}</Text>
                                <Text style={s.cardMeta}>Paket: {PACKAGE_LABELS[sub.packageType] || sub.packageType}</Text>
                                <Text style={s.cardMeta}>Başlangıç: {new Date(sub.startDate).toLocaleDateString('tr-TR')}</Text>
                                <Text style={s.cardMeta}>Bitiş: {new Date(sub.endDate).toLocaleDateString('tr-TR')}</Text>
                                <Text style={[s.cardMeta, { color: urgent ? '#ef4444' : '#10b981', fontWeight: '700' }]}>
                                    {urgent ? `⚠️ ${left} gün kaldı` : `✅ ${left} gün kaldı`}
                                </Text>
                            </View>
                        );
                    }}
                    ListEmptyComponent={<EmptyView text="Aktif abonelik bulunamadı." />}
                />
            )}

            <Modal visible={!!rejectId} transparent animationType="fade" onRequestClose={() => setRejectId(null)}>
                <View style={s.overlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>Ret Nedeni</Text>
                        <TextInput
                            style={s.textArea}
                            placeholder="Ret notu (opsiyonel)..."
                            placeholderTextColor={colors.textMuted}
                            value={rejectNote}
                            onChangeText={setRejectNote}
                            multiline
                        />
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                            <Btn label="Vazgeç" onPress={() => setRejectId(null)} color={colors.textMuted} flex />
                            <Btn label="Reddet" onPress={reject} color="#ef4444" flex />
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

// ── Main Screen ───────────────────────────────────────────────────────────────────
export default function AdminPortalScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = useState(route?.params?.tab || 'dashboard');
    const tabScrollRef = useRef(null);

    useEffect(() => {
        if (route?.params?.tab) setActiveTab(route.params.tab);
    }, [route?.params?.tab]);

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard':      return <DashboardTab />;
            case 'users':          return <UsersTab />;
            case 'courts':         return <CourtsTab />;
            case 'disputes':       return <DisputesTab />;
            case 'posts':          return <PostsTab />;
            case 'venues':         return <VenuesTab />;
            case 'noshow':         return <NoShowTab />;
            case 'cities':         return <CitiesTab />;
            case 'tourperms':      return <TourPermsTab />;
            case 'flagged':        return <FlaggedTab />;
            case 'profilechanges': return <ProfileChangesTab />;
            case 'subscriptions':  return <SubscriptionsTab />;
            case 'venuereviews':   return <VenueReviewsTab />;
            default:               return null;
        }
    };

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.headerTitle}>🛡️ Admin Paneli</Text>
            </View>

            {/* Tab Bar */}
            <FlatList
                ref={tabScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                data={TABS}
                keyExtractor={tab => tab.key}
                style={s.tabBar}
                contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 6, alignItems: 'center' }}
                renderItem={({ item: tab }) => (
                    <TouchableOpacity
                        style={[s.tabBtn, activeTab === tab.key && s.tabBtnActive]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[s.tabBtnText, activeTab === tab.key && s.tabBtnTextActive]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                )}
            />

            {/* Content */}
            <View style={{ flex: 1 }}>
                {renderContent()}
            </View>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: 10,
    },
    backBtn: {
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backBtnText: {
        color: colors.purple,
        fontSize: 32,
        fontWeight: '300',
        lineHeight: 36,
    },
    headerTitle: {
        color: colors.text,
        fontSize: 18,
        fontWeight: '800',
    },
    tabBar: {
        maxHeight: 50,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    tabBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    tabBtnActive: {
        backgroundColor: colors.purple + '28',
    },
    tabBtnText: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
    },
    tabBtnTextActive: {
        color: colors.purple,
        fontWeight: '700',
    },
    card: {
        backgroundColor: colors.surface2,
        borderRadius: 12,
        padding: 14,
        marginHorizontal: 12,
        marginVertical: 5,
        flexDirection: 'row',
        gap: 10,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cardTitle: {
        color: colors.text,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    cardMeta: {
        color: colors.textMuted,
        fontSize: 12,
        lineHeight: 18,
    },
    actionCol: {
        gap: 6,
        justifyContent: 'center',
    },
    statCard: {
        backgroundColor: colors.surface2,
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 4,
    },
    statLabel: {
        color: colors.textMuted,
        fontSize: 14,
    },
    statValue: {
        fontSize: 26,
        fontWeight: '900',
    },
    searchInput: {
        backgroundColor: colors.surface2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        color: colors.text,
        paddingHorizontal: 14,
        paddingVertical: 9,
        fontSize: 14,
    },
    filterBtn: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface2,
    },
    filterBtnActive: {
        backgroundColor: colors.purple + '22',
        borderColor: colors.purple + '60',
    },
    filterBtnText: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
    },
    filterBtnTextActive: {
        color: colors.purple,
        fontWeight: '700',
    },
    overlay: {
        flex: 1,
        backgroundColor: '#000000bb',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBox: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 20,
        width: '85%',
        borderWidth: 1,
        borderColor: colors.border,
    },
    modalTitle: {
        color: colors.text,
        fontSize: 16,
        fontWeight: '800',
        marginBottom: 12,
    },
    textArea: {
        backgroundColor: colors.surface2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        color: colors.text,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 13,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    input: {
        backgroundColor: colors.surface2,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        color: colors.text,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 13,
    },
});
