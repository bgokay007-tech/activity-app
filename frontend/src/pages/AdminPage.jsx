import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../services/api';
import Navbar from '../components/Navbar';

const TABS = ['dashboard', 'users', 'courts', 'disputes', 'posts', 'venues', 'noshow', 'cities'];

const TAB_LABEL = {
    dashboard: '📊 Dashboard',
    users:     '👥 Users',
    courts:    '🏟️ Courts',
    disputes:  '⚠️ Disputes',
    posts:     '📝 Posts',
    venues:    '🏗️ Pending Venues',
    noshow:    '🚫 No-Show Reports',
    cities:    '📍 İl / İlçe Onayı',
};

function StatCard({ label, value, color = 'text-white' }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
            <p className={`font-black text-3xl ${color}`}>{value}</p>
            <p className="text-gray-500 text-xs mt-1">{label}</p>
        </div>
    );
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────
function Dashboard() {
    const [stats, setStats] = useState(null);
    useEffect(() => { api.get('/admin/stats').then(r => setStats(r.data)).catch(() => {}); }, []);
    if (!stats) return <p className="text-gray-500 text-center py-16">Loading...</p>;
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Total Users"      value={stats.users}          color="text-purple-400" />
                <StatCard label="Total Matches"    value={stats.matches}        color="text-blue-400" />
                <StatCard label="Archived Matches" value={stats.archivedMatches} color="text-green-400" />
                <StatCard label="Courts"           value={stats.courts}         color="text-yellow-400" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatCard label="Disputed Matches" value={stats.disputes}      color="text-red-400" />
                <StatCard label="Pending Venues"   value={stats.pendingCourts} color="text-orange-400" />
                <StatCard label="Total Posts"      value={stats.posts}         color="text-pink-400" />
            </div>
        </div>
    );
}

// ── USERS ──────────────────────────────────────────────────────────────────
function UsersPanel() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const me = useSelector(s => s.auth.user?.id);

    useEffect(() => {
        api.get('/admin/users').then(r => setUsers(r.data)).finally(() => setLoading(false));
    }, []);

    const toggle = async (user, field) => {
        try {
            const { data } = await api.patch(`/admin/users/${user.id}`, { [field]: !user[field] });
            setUsers(prev => prev.map(u => u.id === data.id ? { ...u, ...data } : u));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    const del = async (id) => {
        if (!window.confirm('Delete this user? This is irreversible.')) return;
        try {
            await api.delete(`/admin/users/${id}`);
            setUsers(prev => prev.filter(u => u.id !== id));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    const filtered = users.filter(u =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <p className="text-gray-500 text-center py-16">Loading...</p>;

    return (
        <div className="space-y-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by username or email..."
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500" />
            <div className="space-y-2">
                {filtered.map(u => (
                    <div key={u.id} className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-black flex-shrink-0">
                            {u.username?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm truncate">{u.username} {u.isAdmin && <span className="text-yellow-400 text-[10px]">👑 Admin</span>}</p>
                            <p className="text-gray-500 text-xs truncate">{u.email}</p>
                            <p className="text-gray-700 text-[10px]">{u._count.posts} posts · {u._count.sentRequests} matches · Joined {new Date(u.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {u.id !== me && (
                                <>
                                    <button onClick={() => toggle(u, 'isAdmin')}
                                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition ${u.isAdmin ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-yellow-500/40 hover:text-yellow-400'}`}>
                                        {u.isAdmin ? '👑 Admin' : 'Make Admin'}
                                    </button>
                                    <button onClick={() => del(u.id)}
                                        className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition">
                                        Delete
                                    </button>
                                </>
                            )}
                            {u.id === me && <span className="text-[10px] text-gray-600">You</span>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── COURTS ─────────────────────────────────────────────────────────────────
function CourtsPanel() {
    const [courts, setCourts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        api.get('/admin/courts').then(r => setCourts(r.data)).finally(() => setLoading(false));
    }, []);

    const del = async (id) => {
        if (!window.confirm('Delete this court?')) return;
        try {
            await api.delete(`/admin/courts/${id}`);
            setCourts(prev => prev.filter(c => c.id !== id));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    const filtered = courts.filter(c =>
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.city || '').toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <p className="text-gray-500 text-center py-16">Loading...</p>;

    return (
        <div className="space-y-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or city..."
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500" />
            <p className="text-gray-500 text-xs">{filtered.length} courts</p>
            <div className="space-y-2">
                {filtered.map(c => (
                    <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-white font-bold text-sm">{c.name || '—'}</p>
                                {c.verified && <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded-full">✓ Verified</span>}
                                {c.pending  && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">⏳ Pending</span>}
                            </div>
                            <p className="text-gray-400 text-xs">{[c.sport, c.surface, c.city, c.address].filter(Boolean).join(' · ')}</p>
                            {c.feeAmount && <p className="text-gray-500 text-[10px]">Fee: {c.feeAmount}₺ · {c.hasLights ? '💡 Lights' : 'No lights'} · {c.isIndoor ? '🏠 Indoor' : '☀️ Outdoor'}</p>}
                            <p className="text-gray-600 text-[10px]">Submitted by @{c.user?.username} · {new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <button onClick={() => del(c.id)}
                            className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition">
                            Delete
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── DISPUTES ───────────────────────────────────────────────────────────────
function DisputesPanel() {
    const [disputes, setDisputes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/admin/disputes').then(r => setDisputes(r.data)).finally(() => setLoading(false));
    }, []);

    const resolve = async (id, winner) => {
        try {
            await api.patch(`/admin/disputes/${id}/resolve`, { winner });
            setDisputes(prev => prev.filter(d => d.id !== id));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    if (loading) return <p className="text-gray-500 text-center py-16">Loading...</p>;
    if (disputes.length === 0) return (
        <div className="text-center py-16 bg-gray-900 rounded-2xl border border-gray-800">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-white font-bold">No disputed matches</p>
        </div>
    );

    return (
        <div className="space-y-4">
            {disputes.map(d => {
                const score = d.score || {};
                return (
                    <div key={d.id} className="bg-red-500/5 border border-red-500/30 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-red-400 font-bold text-sm">⚠️ Score Disputed</span>
                            <span className="text-gray-500 text-xs">{new Date(d.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        </div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="text-center flex-1">
                                <p className="text-white font-black">{d.sender?.username}</p>
                                <p className="text-gray-500 text-xs">Sender</p>
                            </div>
                            <span className="text-gray-600 font-black text-lg">vs</span>
                            <div className="text-center flex-1">
                                <p className="text-white font-black">{d.receiver?.username}</p>
                                <p className="text-gray-500 text-xs">Receiver</p>
                            </div>
                        </div>
                        {score.sets?.length > 0 && (
                            <p className="text-gray-400 text-xs text-center mb-4">
                                Score: {score.sets.map(s => `${s.s}–${s.r}`).join(', ')}
                                {score.winner && ` · Claimed winner: ${score.winner}`}
                            </p>
                        )}
                        <p className="text-gray-500 text-xs mb-3">Category: {d.category} / {d.subCategory}</p>
                        <div className="flex gap-2">
                            <button onClick={() => resolve(d.id, 'sender')}
                                className="flex-1 bg-blue-600/80 hover:bg-blue-600 text-white font-bold py-2 rounded-xl text-sm transition">
                                🏆 {d.sender?.username} Wins
                            </button>
                            <button onClick={() => resolve(d.id, 'draw')}
                                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-xl text-sm transition">
                                🤝 Draw
                            </button>
                            <button onClick={() => resolve(d.id, 'receiver')}
                                className="flex-1 bg-purple-600/80 hover:bg-purple-600 text-white font-bold py-2 rounded-xl text-sm transition">
                                🏆 {d.receiver?.username} Wins
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ── POSTS ──────────────────────────────────────────────────────────────────
function PostsPanel() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        api.get('/admin/posts').then(r => setPosts(r.data)).finally(() => setLoading(false));
    }, []);

    const del = async (id) => {
        if (!window.confirm('Delete this post?')) return;
        try {
            await api.delete(`/admin/posts/${id}`);
            setPosts(prev => prev.filter(p => p.id !== id));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    const filtered = posts.filter(p =>
        (p.content || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.user?.username || '').toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <p className="text-gray-500 text-center py-16">Loading...</p>;

    return (
        <div className="space-y-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by content or username..."
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500" />
            <p className="text-gray-500 text-xs">{filtered.length} posts</p>
            <div className="space-y-2">
                {filtered.map(p => (
                    <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 flex items-start gap-3">
                        {p.imageUrl && <img src={p.imageUrl} alt="" className="w-14 h-14 object-cover rounded-xl flex-shrink-0" onError={e => e.target.style.display='none'} />}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-purple-400 text-xs font-bold">@{p.user?.username}</span>
                                <span className="text-gray-700 text-[10px]">{p.type}</span>
                                {p.hidden && <span className="text-[10px] text-gray-600">🙈 Hidden</span>}
                            </div>
                            <p className="text-gray-200 text-sm line-clamp-2">{p.content}</p>
                            <p className="text-gray-600 text-[10px] mt-1">{new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <button onClick={() => del(p.id)}
                            className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition mt-1">
                            Delete
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── PENDING VENUES (existing logic, improved UI) ───────────────────────────
function VenuesPanel() {
    const [courts, setCourts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState({});
    const [rejectReason, setRejectReason] = useState({});
    const [showReject, setShowReject] = useState({});

    useEffect(() => {
        api.get('/courts/admin/pending').then(r => setCourts(r.data)).finally(() => setLoading(false));
    }, []);

    const field = (courtId, key, placeholder, current) => (
        <input
            value={editing[courtId]?.[key] ?? current ?? ''}
            onChange={e => setEditing(prev => ({ ...prev, [courtId]: { ...prev[courtId], [key]: e.target.value } }))}
            placeholder={placeholder}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm border border-gray-700 focus:outline-none focus:border-purple-500"
        />
    );

    const verify = async (court) => {
        try {
            await api.patch(`/courts/admin/${court.id}/verify`, editing[court.id] || {});
            setCourts(prev => prev.filter(c => c.id !== court.id));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    const reject = async (id) => {
        try {
            await api.patch(`/courts/admin/${id}/reject`, { reason: rejectReason[id] || '' });
            setCourts(prev => prev.filter(c => c.id !== id));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    if (loading) return <p className="text-gray-500 text-center py-16">Loading...</p>;
    if (courts.length === 0) return (
        <div className="text-center py-16 bg-gray-900 rounded-2xl border border-gray-800">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-white font-bold">No pending venues</p>
            <p className="text-gray-400 text-sm mt-1">All submissions reviewed.</p>
        </div>
    );

    return (
        <div className="space-y-4">
            {courts.map(court => (
                <div key={court.id} className="bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold">
                            {court.user?.username?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1">
                            <p className="text-white text-sm font-bold">{court.user?.fullName || court.user?.username}</p>
                            <p className="text-gray-500 text-xs">Submitted {new Date(court.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <span className="text-xs font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 rounded-full">⏳ Pending</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-gray-500 text-xs block mb-1">Name</label>{field(court.id, 'name', 'Venue name', court.name)}</div>
                        <div><label className="text-gray-500 text-xs block mb-1">City</label>{field(court.id, 'city', 'City', court.city)}</div>
                        <div className="col-span-2"><label className="text-gray-500 text-xs block mb-1">Address</label>{field(court.id, 'address', 'Address', court.address)}</div>
                        <div>
                            <label className="text-gray-500 text-xs block mb-1">Zemin</label>
                            <select
                                value={editing[court.id]?.surface ?? court.surface ?? ''}
                                onChange={e => setEditing(prev => ({ ...prev, [court.id]: { ...prev[court.id], surface: e.target.value || null } }))}
                                className="w-full bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm border border-gray-700 focus:outline-none focus:border-purple-500">
                                <option value="">— Belirtilmemiş —</option>
                                <option value="HARD">Hard</option>
                                <option value="CLAY">Toprak</option>
                                <option value="GRASS">Çim</option>
                                <option value="CARPET">Halı</option>
                                <option value="ARTIFICIAL">Suni Çim</option>
                                <option value="SAND">Kum</option>
                                <option value="WOOD">Parke</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-gray-500 text-xs block mb-1">Açık / Kapalı</label>
                            <select
                                value={editing[court.id]?.indoor !== undefined ? String(editing[court.id].indoor) : court.indoor !== undefined ? String(court.indoor) : ''}
                                onChange={e => setEditing(prev => ({ ...prev, [court.id]: { ...prev[court.id], indoor: e.target.value === '' ? null : e.target.value === 'true' } }))}
                                className="w-full bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm border border-gray-700 focus:outline-none focus:border-purple-500">
                                <option value="">— Belirtilmemiş —</option>
                                <option value="false">Açık (Outdoor)</option>
                                <option value="true">Kapalı (Indoor)</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => verify(court)} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-black py-2.5 rounded-xl text-sm transition">✅ Approve</button>
                        <button onClick={() => setShowReject(p => ({ ...p, [court.id]: !p[court.id] }))} className="flex-1 bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black py-2.5 rounded-xl text-sm transition">✕ Reject</button>
                    </div>
                    {showReject[court.id] && (
                        <div className="space-y-2">
                            <input value={rejectReason[court.id] || ''} onChange={e => setRejectReason(p => ({ ...p, [court.id]: e.target.value }))}
                                placeholder="Rejection reason (optional)"
                                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-red-700/40 focus:outline-none" />
                            <button onClick={() => reject(court.id)} className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded-xl text-sm transition">Confirm Rejection</button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ── NO-SHOW REPORTS ────────────────────────────────────────────────────────
function NoShowPanel() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = () => {
        setLoading(true);
        api.get('/admin/no-show-reports').then(r => setReports(r.data)).finally(() => setLoading(false));
    };
    useEffect(() => { load(); }, []);

    const approve = async (id) => {
        if (!window.confirm('Onayla ve 0.40 puan kes?')) return;
        try {
            await api.patch(`/admin/no-show-reports/${id}/approve`);
            setReports(prev => prev.filter(r => r.id !== id));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    const reject = async (id) => {
        if (!window.confirm('Reddet?')) return;
        try {
            await api.patch(`/admin/no-show-reports/${id}/reject`);
            setReports(prev => prev.filter(r => r.id !== id));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    if (loading) return <p className="text-gray-500 text-center py-16">Loading...</p>;
    if (!reports.length) return <p className="text-gray-500 text-center py-16">Bekleyen bildirim yok.</p>;

    return (
        <div className="space-y-4">
            <p className="text-gray-500 text-xs">{reports.length} bekleyen bildirim</p>
            {reports.map(r => (
                <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm">
                                🏅 {r.rival?.subCategory} · {r.rival?.matchDate ? new Date(r.rival.matchDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '—'} {r.rival?.matchTime || ''}
                            </p>
                            <p className="text-gray-500 text-xs mt-0.5">Bildiren: @{r.reporter?.username}</p>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                <span className="text-[10px] text-gray-400">Gelenmeyen:</span>
                                {(r.absentUsers || []).map(u => (
                                    <span key={u.id} className="text-[11px] bg-orange-500/15 border border-orange-500/30 text-orange-400 px-2 py-0.5 rounded-full font-bold">
                                        @{u.username}
                                    </span>
                                ))}
                            </div>
                            <p className="text-gray-600 text-[10px] mt-1">{new Date(r.createdAt).toLocaleString('tr-TR')}</p>
                        </div>
                        {r.courtPhotoUrl && (
                            <a href={r.courtPhotoUrl} target="_blank" rel="noreferrer">
                                <img src={r.courtPhotoUrl} alt="court" className="w-24 h-16 object-cover rounded-xl border border-gray-700 shrink-0" />
                            </a>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => approve(r.id)}
                            className="flex-1 bg-green-900/40 hover:bg-green-900/60 border border-green-700/50 text-green-400 font-black py-2 rounded-xl text-sm transition">
                            ✓ Onayla (-0.40 puan)
                        </button>
                        <button onClick={() => reject(r.id)}
                            className="flex-1 bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black py-2 rounded-xl text-sm transition">
                            ✕ Reddet
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── CITIES ────────────────────────────────────────────────────────────────
function CitiesPanel() {
    const [cities, setCities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('PENDING');

    const load = (status) => {
        setLoading(true);
        api.get(`/admin/cities?status=${status}`).then(r => setCities(r.data)).finally(() => setLoading(false));
    };
    useEffect(() => { load(filter); }, [filter]);

    const approve = async (id) => {
        try {
            await api.patch(`/admin/cities/${id}`, { status: 'APPROVED' });
            setCities(prev => prev.filter(c => c.id !== id));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    const reject = async (id) => {
        if (!window.confirm('Reddet ve sil?')) return;
        try {
            await api.patch(`/admin/cities/${id}`, { status: 'REJECTED' });
            setCities(prev => prev.filter(c => c.id !== id));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                {['PENDING', 'APPROVED'].map(s => (
                    <button key={s} onClick={() => setFilter(s)}
                        className={`px-4 py-1.5 rounded-xl text-sm font-bold transition border ${filter === s ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                        {s === 'PENDING' ? '⏳ Bekleyenler' : '✅ Onaylananlar'}
                    </button>
                ))}
            </div>
            {loading ? <p className="text-gray-500 text-center py-16">Loading...</p> :
             cities.length === 0 ? (
                <div className="text-center py-16 bg-gray-900 rounded-2xl border border-gray-800">
                    <p className="text-4xl mb-3">✅</p>
                    <p className="text-white font-bold">Bekleyen il/ilçe yok</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {cities.map(c => (
                        <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 flex items-center gap-3">
                            <div className="flex-1">
                                <p className="text-white font-bold text-sm">
                                    📍 {c.province}{c.district ? ` / ${c.district}` : ''}
                                </p>
                                <p className="text-gray-600 text-[10px] mt-0.5">{new Date(c.createdAt).toLocaleString('tr-TR')}</p>
                            </div>
                            {filter === 'PENDING' && (
                                <div className="flex gap-2">
                                    <button onClick={() => approve(c.id)}
                                        className="px-3 py-1.5 rounded-xl bg-green-900/40 hover:bg-green-900/60 border border-green-700/50 text-green-400 font-black text-xs transition">
                                        ✓ Onayla
                                    </button>
                                    <button onClick={() => reject(c.id)}
                                        className="px-3 py-1.5 rounded-xl bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black text-xs transition">
                                        ✕ Reddet
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── MAIN ───────────────────────────────────────────────────────────────────
export default function AdminPage() {
    const navigate = useNavigate();
    const user = useSelector(s => s.auth.user);
    const [activeTab, setActiveTab] = useState('dashboard');

    useEffect(() => {
        if (user && !user.isAdmin) navigate('/home');
    }, [user]);

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar />
            <div className="flex gap-0 min-h-[calc(100vh-57px)]">

                {/* Sidebar */}
                <div className="w-52 shrink-0 bg-gray-900 border-r border-gray-800 p-3 space-y-1 overflow-y-auto">
                    <div className="px-3 py-2 mb-2">
                        <p className="text-yellow-400 font-black text-sm">👑 Admin Panel</p>
                        <p className="text-gray-600 text-[10px]">@{user?.username}</p>
                    </div>
                    {TABS.map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition ${activeTab === tab ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
                            {TAB_LABEL[tab]}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 p-6 overflow-y-auto">
                    <h2 className="text-white font-black text-xl mb-6">{TAB_LABEL[activeTab]}</h2>
                    {activeTab === 'dashboard' && <Dashboard />}
                    {activeTab === 'users'     && <UsersPanel />}
                    {activeTab === 'courts'    && <CourtsPanel />}
                    {activeTab === 'disputes'  && <DisputesPanel />}
                    {activeTab === 'posts'     && <PostsPanel />}
                    {activeTab === 'venues'    && <VenuesPanel />}
                    {activeTab === 'noshow'    && <NoShowPanel />}
                    {activeTab === 'cities'    && <CitiesPanel />}
                </div>
            </div>
        </div>
    );
}
