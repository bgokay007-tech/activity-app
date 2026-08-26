import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../services/api';
import Navbar from '../components/Navbar';
import { useTranslation } from 'react-i18next';

const TABS = ['dashboard', 'users', 'courts', 'disputes', 'posts', 'venues', 'biz-venues', 'noshow', 'cities', 'tournament-perms', 'flagged-listings', 'profile-changes', 'subscriptions', 'venue-reviews', 'coach-listing-approval', 'referee-approval', 'coach-rating-approval'];
// Kullanıcı isteği: admin panelinin TAMAMI (sekme etiketleri dahil) TR/EN dil
// değişimine uysun — önceden bu etiketler sabit (çoğu Türkçe/İngilizce karışık)
// bir objeydi, dil değiştirince hiç değişmiyordu. Artık AdminPage içinde
// t(`admin.tabs.${tab}`) ile canlı okunuyor (bkz. dynamicTabLabels).

// Kullanıcı isteği: sidebar'daki her onay kuyruğu sekmesinin yanında bekleyen kayıt sayısı
// parantez içinde görünsün, sayı > 0 iken yanıp sönerek adminin dikkatini çeksin (onaylar
// bekletilmesin). İnaktif sekmeler mount olmadığı için (bkz. içerik alanı, sadece activeTab
// render ediliyor) her panelin kendi fetch'ine güvenemeyiz — tek bir toplu endpoint'ten
// (bkz. backend admin.controller.js getPendingCounts) periyodik çekiliyor.
function usePendingCounts() {
    const [counts, setCounts] = useState({});
    useEffect(() => {
        let cancelled = false;
        const load = () => {
            api.get('/admin/pending-counts').then(r => { if (!cancelled) setCounts(r.data); }).catch(() => {});
        };
        load();
        const interval = setInterval(load, 30000);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);
    return counts;
}

// Spor dalına göre filtre çipleri — kort/salon listeleri büyüdükçe (binlerce kayıt)
// tenis/padel/voleybol vb. birbirine karışmasın diye Courts/Pending Venues/İşletme
// Tesisleri panellerinin üçünde de kullanılıyor. Sabit bir dal listesi tutmak yerine
// mevcut veride gerçekten var olan dalları (ve sayılarını) gösterir, yeni bir dal
// eklendiğinde otomatik çıkar, bakım gerektirmez.
function SportFilterChips({ items, getSport, value, onChange }) {
    const counts = {};
    for (const it of items) {
        const s = getSport(it) || '—';
        counts[s] = (counts[s] || 0) + 1;
    }
    const sports = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    if (sports.length <= 1) return null;
    const chipClass = (active) => `shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition ${active ? 'bg-purple-500/20 border-purple-500 text-purple-300' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'}`;
    return (
        <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => onChange('all')} className={chipClass(value === 'all')}>Tümü ({items.length})</button>
            {sports.map(s => (
                <button key={s} onClick={() => onChange(s)} className={chipClass(value === s)}>{s} ({counts[s]})</button>
            ))}
        </div>
    );
}

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
    const { t } = useTranslation();
    const [stats, setStats] = useState(null);
    useEffect(() => { api.get('/admin/stats').then(r => setStats(r.data)).catch(() => {}); }, []);
    if (!stats) return <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p>;
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label={t('admin.dashboard.total_users')}      value={stats.users}          color="text-purple-400" />
                <StatCard label={t('admin.dashboard.total_matches')}    value={stats.matches}        color="text-blue-400" />
                <StatCard label={t('admin.dashboard.archived_matches')} value={stats.archivedMatches} color="text-green-400" />
                <StatCard label={t('admin.dashboard.courts')}           value={stats.courts}         color="text-yellow-400" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatCard label={t('admin.dashboard.disputed_matches')} value={stats.disputes}      color="text-red-400" />
                <StatCard label={t('admin.dashboard.pending_venues')}   value={stats.pendingCourts} color="text-orange-400" />
                <StatCard label={t('admin.dashboard.total_posts')}      value={stats.posts}         color="text-pink-400" />
            </div>
        </div>
    );
}

// ── USERS ──────────────────────────────────────────────────────────────────
function UsersPanel() {
    const { t } = useTranslation();
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
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    const del = async (id) => {
        if (!window.confirm(t('admin.users.confirm_delete'))) return;
        try {
            await api.delete(`/admin/users/${id}`);
            setUsers(prev => prev.filter(u => u.id !== id));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    const filtered = users.filter(u =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p>;

    return (
        <div className="space-y-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t('admin.users.search_placeholder')}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500" />
            <div className="space-y-2">
                {filtered.map(u => (
                    <div key={u.id} className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-black flex-shrink-0">
                            {u.username?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm truncate">{u.username} {u.isAdmin && <span className="text-yellow-400 text-[10px]">{t('admin.users.admin_badge')}</span>}</p>
                            <p className="text-gray-500 text-xs truncate">{u.email}</p>
                            <p className="text-gray-700 text-[10px]">{t('admin.users.stats_line', { posts: u._count.posts, matches: u._count.sentRequests, date: new Date(u.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) })}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {u.id !== me && (
                                <>
                                    <button onClick={() => toggle(u, 'isAdmin')}
                                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition ${u.isAdmin ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-yellow-500/40 hover:text-yellow-400'}`}>
                                        {u.isAdmin ? t('admin.users.admin_badge') : t('admin.users.make_admin')}
                                    </button>
                                    <button onClick={() => del(u.id)}
                                        className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition">
                                        {t('admin.common.delete')}
                                    </button>
                                </>
                            )}
                            {u.id === me && <span className="text-[10px] text-gray-600">{t('admin.common.you')}</span>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── COURTS ─────────────────────────────────────────────────────────────────
// Kullanıcı isteği: onaylanmış bir kort/salon/saha satırına tıklayınca detay bilgileri
// (zemin, açık/kapalı, adres, il, ilçe vb.) açılsın, orada da (onay anında olduğu gibi)
// değiştirme/ekleme yapılabilsin — onay sırasında gözden kaçan bir bilgi olabilir.
// PATCH /admin/courts/:id (adminUpdateCourt) sahiplik kontrolü yapmadığı için community
// kortlarında da (admin kendisi eklememiş olsa bile) çalışır.
function CourtEditModal({ court, onClose, onSave }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({
        name: court.name || '', city: court.city || '', district: court.district || '',
        address: court.address || '', surface: court.surface || '', indoor: !!court.indoor,
        fee: !!court.fee, feeAmount: court.feeAmount || '', lights: !!court.lights,
        description: court.description || '',
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);

    const save = async () => {
        setSaving(true); setErr(null);
        try {
            const { data } = await api.patch(`/admin/courts/${court.id}`, form);
            onSave(data);
            onClose();
        } catch (e) { setErr(e?.response?.data?.message || e?.message || t('admin.courts.save_failed')); }
        finally { setSaving(false); }
    };

    const inputCls = "w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm";

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800 flex-shrink-0">
                    <div>
                        <h3 className="text-white font-bold">{t('admin.courts.edit_title')}</h3>
                        <p className="text-gray-500 text-xs mt-0.5">{court.sport} · @{court.user?.username}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {err && <p className="text-red-400 text-xs font-bold">{err}</p>}
                    <div><label className="text-gray-500 text-xs block mb-1">{t('admin.courts.name_label')}</label>
                        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-gray-500 text-xs block mb-1">{t('admin.courts.city_label')}</label>
                            <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inputCls} /></div>
                        <div><label className="text-gray-500 text-xs block mb-1">{t('admin.courts.district_label')}</label>
                            <input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} className={inputCls} /></div>
                    </div>
                    <div><label className="text-gray-500 text-xs block mb-1">{t('admin.courts.address_label')}</label>
                        <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={inputCls} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-gray-500 text-xs block mb-1">{t('admin.courts.surface_label')}</label>
                            <select value={form.surface} onChange={e => setForm(f => ({ ...f, surface: e.target.value }))} className={inputCls}>
                                <option value="">{t('admin.common.unspecified_option')}</option>
                                <option value="HARD">{t('admin.common.surface_hard')}</option>
                                <option value="CLAY">{t('admin.common.surface_clay')}</option>
                                <option value="GRASS">{t('admin.common.surface_grass')}</option>
                                <option value="CARPET">{t('admin.common.surface_carpet')}</option>
                                <option value="ARTIFICIAL">{t('admin.common.surface_artificial')}</option>
                                <option value="SAND">{t('admin.common.surface_sand')}</option>
                                <option value="WOOD">{t('admin.common.surface_wood')}</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-gray-500 text-xs block mb-1">{t('admin.courts.indoor_outdoor_label')}</label>
                            <select value={String(form.indoor)} onChange={e => setForm(f => ({ ...f, indoor: e.target.value === 'true' }))} className={inputCls}>
                                <option value="false">{t('admin.common.outdoor_option')}</option>
                                <option value="true">{t('admin.common.indoor_option')}</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { key: 'indoor', label: t('admin.courts.toggle_indoor') },
                            { key: 'lights', label: t('admin.courts.toggle_lights') },
                            { key: 'fee',    label: t('admin.courts.toggle_fee')    },
                        ].map(tg => (
                            <button key={tg.key} type="button"
                                onClick={() => setForm(f => ({ ...f, [tg.key]: !f[tg.key] }))}
                                className={`py-2 rounded-xl text-xs font-bold border transition ${form[tg.key] ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                {tg.label}
                            </button>
                        ))}
                    </div>
                    {form.fee && (
                        <input value={form.feeAmount} onChange={e => setForm(f => ({ ...f, feeAmount: e.target.value }))}
                            placeholder={t('admin.courts.fee_placeholder')} className={inputCls} />
                    )}
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder={t('admin.courts.description_placeholder')} rows={2} className={inputCls + ' resize-none'} />
                </div>
                <div className="px-6 py-4 border-t border-gray-800 flex gap-3 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl border border-gray-700 text-sm">{t('admin.common.cancel')}</button>
                    <button onClick={save} disabled={saving}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-50 text-sm">
                        {saving ? t('admin.common.saving') : t('admin.common.save')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function CourtsPanel() {
    const { t } = useTranslation();
    const [courts, setCourts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [sportFilter, setSportFilter] = useState('all');
    const [error, setError] = useState(null);
    const [editingCourt, setEditingCourt] = useState(null);

    useEffect(() => {
        api.get('/admin/courts')
            .then(r => setCourts(r.data))
            .catch(e => setError(e?.response?.data?.message || e?.message || t('admin.courts.api_error')))
            .finally(() => setLoading(false));
    }, []);

    const del = async (id) => {
        if (!window.confirm(t('admin.common.delete') + '?')) return;
        try {
            await api.delete(`/admin/courts/${id}`);
            setCourts(prev => prev.filter(c => c.id !== id));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    // Onayla/Reddet — /admin/courts sadece listeleme+silme yapıyordu, gerçek onay akışı
    // ayrı bir router'da (/courts/admin/:id/verify|reject) duruyordu ve panelden hiç
    // çağrılmıyordu — kullanıcı bir mekanı onayladığında sadece o dalın aramasında
    // çıkması için bu iki eylem burada eksikti.
    const approve = async (id) => {
        try {
            const { data } = await api.patch(`/courts/admin/${id}/verify`);
            setCourts(prev => prev.map(c => c.id === id ? data : c));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };
    const reject = async (id) => {
        const reason = window.prompt(t('admin.venues.reject_reason_ph')) || undefined;
        try {
            const { data } = await api.patch(`/courts/admin/${id}/reject`, { reason });
            setCourts(prev => prev.map(c => c.id === id ? data : c));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    // Kullanıcı isteği: mobil taraftaki "Eksik Bilgileri Tamamla" formundan (suggestCourtEdit)
    // gelen, zaten onaylı bir kortun telefon/kort sayısı/çalışma günü-saati gibi eksik
    // bilgisini tamamlayan öneriler burada onaylanıp gerçek alanlara uygulanır.
    const approveEdit = async (id) => {
        try {
            const { data } = await api.patch(`/courts/admin/${id}/approve-edit`);
            setCourts(prev => prev.map(c => c.id === id ? data.court || { ...c, pendingEdit: null } : c));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };
    const rejectEdit = async (id) => {
        const adminNote = window.prompt(t('admin.common.reject_note_placeholder')) || undefined;
        try {
            await api.patch(`/courts/admin/${id}/reject-edit`, { adminNote });
            setCourts(prev => prev.map(c => c.id === id ? { ...c, pendingEdit: null } : c));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    const filtered = courts.filter(c =>
        (sportFilter === 'all' || c.sport === sportFilter) &&
        ((c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.city || '').toLowerCase().includes(search.toLowerCase()))
    );

    if (loading) return <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p>;
    if (error) return <p className="text-red-400 text-center py-16 font-bold">{t('admin.common.error_prefix')} {error}</p>;

    return (
        <div className="space-y-4">
            <SportFilterChips items={courts} getSport={c => c.sport} value={sportFilter} onChange={setSportFilter} />
            <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t('admin.courts.search_placeholder')}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500" />
            <p className="text-gray-500 text-xs">{t('admin.courts.count_label', { count: filtered.length })}</p>
            <div className="space-y-2">
                {/* Bekleyen bilgi güncelleme önerileri en üstte — listenin altına gizlenip
                    fark edilmemesin diye. */}
                {filtered.filter(c => c.pendingEdit).map(c => (
                    <div key={c.id + '_edit'} className="bg-purple-950/30 border border-purple-500/40 rounded-2xl px-4 py-3 space-y-1.5">
                        <p className="text-purple-300 text-xs font-bold">{t('admin.courts.pending_edit_title', { name: c.name })}</p>
                        <div className="text-gray-300 text-xs space-y-0.5">
                            {c.pendingEdit.name && <p>{t('admin.courts.field_name')}: {c.pendingEdit.name}</p>}
                            {c.pendingEdit.city && <p>{t('admin.courts.field_city')}: {c.pendingEdit.city}</p>}
                            {c.pendingEdit.district && <p>{t('admin.courts.field_district')}: {c.pendingEdit.district}</p>}
                            {c.pendingEdit.address && <p>{t('admin.courts.field_address')}: {c.pendingEdit.address}</p>}
                            {c.pendingEdit.phone && <p>{t('admin.courts.field_phone')}: {c.pendingEdit.phone}</p>}
                            {c.pendingEdit.courtCount != null && <p>{t('admin.courts.field_court_count')}: {c.pendingEdit.courtCount}</p>}
                            {(c.pendingEdit.openTime || c.pendingEdit.closeTime) && <p>{t('admin.courts.field_hours')}: {c.pendingEdit.openTime || c.openTime || '—'} – {c.pendingEdit.closeTime || c.closeTime || '—'}</p>}
                            {c.pendingEdit.openDays && <p>{t('admin.courts.field_days')}: {c.pendingEdit.openDays.join(', ')}</p>}
                        </div>
                        <div className="flex gap-1.5 pt-1">
                            <button onClick={() => approveEdit(c.id)}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 transition">
                                {t('admin.courts.approve_edit')}
                            </button>
                            <button onClick={() => rejectEdit(c.id)}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition">
                                {t('admin.courts.reject_edit')}
                            </button>
                        </div>
                    </div>
                ))}
                {filtered.map(c => (
                    <div key={c.id} onClick={() => setEditingCourt(c)}
                        className="bg-gray-900 border border-gray-800 hover:border-purple-500/50 rounded-2xl px-4 py-3 flex items-center gap-3 cursor-pointer transition">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-white font-bold text-sm">{c.name || '—'}</p>
                                {c.verified && <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded-full">{t('admin.courts.verified_badge')}</span>}
                                {c.pending  && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">{t('admin.courts.pending_badge')}</span>}
                            </div>
                            <p className="text-gray-400 text-xs">{[c.sport, c.surface, c.city, c.address].filter(Boolean).join(' · ')}</p>
                            {c.feeAmount && <p className="text-gray-500 text-[10px]">{t('admin.courts.fee_label', { amount: c.feeAmount })} · {c.hasLights ? t('admin.courts.lights_on') : t('admin.courts.lights_off')} · {c.isIndoor ? t('admin.courts.indoor_badge') : t('admin.courts.outdoor_badge')}</p>}
                            <p className="text-gray-600 text-[10px]">{t('admin.courts.submitted_by', { username: c.user?.username, date: new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) })}</p>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                            {c.pending && (
                                <>
                                    <button onClick={() => approve(c.id)}
                                        className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 transition">
                                        {t('admin.common.approve')}
                                    </button>
                                    <button onClick={() => reject(c.id)}
                                        className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 transition">
                                        {t('admin.common.reject')}
                                    </button>
                                </>
                            )}
                            <button onClick={() => del(c.id)}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition">
                                {t('admin.common.delete')}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {editingCourt && (
                <CourtEditModal
                    court={editingCourt}
                    onClose={() => setEditingCourt(null)}
                    onSave={updated => setCourts(prev => prev.map(c => c.id === updated.id ? updated : c))}
                />
            )}
        </div>
    );
}

// ── DISPUTES ───────────────────────────────────────────────────────────────
function DisputesPanel() {
    const { t } = useTranslation();
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

    // Kullanıcı raporu: liste hem skoru DIŞARIDAN itirazlı (scoreStatus:DISPUTED) hem de
    // kullanıcı tarafından İTİRAZ EDİLMİŞ (scoreAppeal:true) maçları birlikte gösteriyordu
    // ama sadece "kazananı seç" (resolveDispute) butonları vardı — bu, scoreStatus'u
    // CONFIRMED yapıyor ama scoreAppeal'i hiç değiştirmiyor, dolayısıyla itiraz edilen bir
    // maç "çözüldükten" sonra bile listede/sayaçta kalmaya devam ediyordu (sayfa
    // yenilense bile aynı kayıt tekrar dönüyordu). İtiraz için ayrı resolveAppeal
    // (RESET/REJECTED) eylemi eklendi.
    const resolveAppeal = async (id, resolution) => {
        try {
            await api.patch(`/admin/disputes/${id}/resolve-appeal`, { resolution });
            setDisputes(prev => prev.filter(d => d.id !== id));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    if (loading) return <p className="text-gray-500 text-center py-16">{t('disputes.loading')}</p>;
    if (disputes.length === 0) return (
        <div className="text-center py-16 bg-gray-900 rounded-2xl border border-gray-800">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-white font-bold">{t('disputes.no_disputes')}</p>
        </div>
    );

    return (
        <div className="space-y-4">
            {disputes.map(d => {
                const score = d.score || {};
                const isAppeal = d.scoreAppeal;
                const isDisputed = d.scoreStatus === 'DISPUTED';
                return (
                    <div key={d.id} className="bg-red-500/5 border border-red-500/30 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-red-400 font-bold text-sm">{isAppeal ? t('disputes.appealed') : t('disputes.score_disputed')}</span>
                            <span className="text-gray-500 text-xs">{new Date(d.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        </div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="text-center flex-1">
                                <p className="text-white font-black">{d.sender?.username}</p>
                                <p className="text-gray-500 text-xs">{t('disputes.sender')}</p>
                            </div>
                            <span className="text-gray-600 font-black text-lg">vs</span>
                            <div className="text-center flex-1">
                                <p className="text-white font-black">{d.receiver?.username}</p>
                                <p className="text-gray-500 text-xs">{t('disputes.receiver')}</p>
                            </div>
                        </div>
                        {score.sets?.length > 0 && (
                            <p className="text-gray-400 text-xs text-center mb-4">
                                {t('disputes.score_label')}: {score.sets.map(s => `${s.s}–${s.r}`).join(', ')}
                                {score.winner && ` · ${t('disputes.claimed_winner')}: ${score.winner}`}
                            </p>
                        )}
                        <p className="text-gray-500 text-xs mb-3">{t('disputes.category_label')}: {d.category} / {d.subCategory}</p>
                        {isAppeal && d.scoreAppealReason && (
                            <p className="text-yellow-400 text-xs mb-3">{t('disputes.appeal_reason')}: {d.scoreAppealReason}</p>
                        )}
                        {isAppeal && (
                            <div className="flex gap-2 mb-2">
                                <button onClick={() => resolveAppeal(d.id, 'RESET')}
                                    className="flex-1 bg-yellow-600/80 hover:bg-yellow-600 text-white font-bold py-2 rounded-xl text-sm transition">
                                    {t('disputes.reset_score')}
                                </button>
                                <button onClick={() => resolveAppeal(d.id, 'REJECTED')}
                                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-xl text-sm transition">
                                    {t('disputes.reject_appeal')}
                                </button>
                            </div>
                        )}
                        {isDisputed && (
                            <div className="flex gap-2">
                                <button onClick={() => resolve(d.id, 'sender')}
                                    className="flex-1 bg-blue-600/80 hover:bg-blue-600 text-white font-bold py-2 rounded-xl text-sm transition">
                                    🏆 {t('disputes.wins', { name: d.sender?.username })}
                                </button>
                                <button onClick={() => resolve(d.id, 'draw')}
                                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-xl text-sm transition">
                                    🤝 {t('disputes.draw')}
                                </button>
                                <button onClick={() => resolve(d.id, 'receiver')}
                                    className="flex-1 bg-purple-600/80 hover:bg-purple-600 text-white font-bold py-2 rounded-xl text-sm transition">
                                    🏆 {t('disputes.wins', { name: d.receiver?.username })}
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── POSTS ──────────────────────────────────────────────────────────────────
function PostsPanel() {
    const { t } = useTranslation();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        api.get('/admin/posts').then(r => setPosts(r.data)).finally(() => setLoading(false));
    }, []);

    const del = async (id) => {
        if (!window.confirm(t('admin.common.delete') + '?')) return;
        try {
            await api.delete(`/admin/posts/${id}`);
            setPosts(prev => prev.filter(p => p.id !== id));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    const filtered = posts.filter(p =>
        (p.content || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.user?.username || '').toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p>;

    return (
        <div className="space-y-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t('admin.posts.search_placeholder')}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500" />
            <p className="text-gray-500 text-xs">{t('admin.posts.count_label', { count: filtered.length })}</p>
            <div className="space-y-2">
                {filtered.map(p => (
                    <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 flex items-start gap-3">
                        {p.imageUrl && <img src={p.imageUrl} alt="" className="w-14 h-14 object-cover rounded-xl flex-shrink-0" onError={e => e.target.style.display='none'} />}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-purple-400 text-xs font-bold">@{p.user?.username}</span>
                                <span className="text-gray-700 text-[10px]">{p.type}</span>
                                {p.hidden && <span className="text-[10px] text-gray-600">{t('admin.posts.hidden_badge')}</span>}
                            </div>
                            <p className="text-gray-200 text-sm line-clamp-2">{p.content}</p>
                            <p className="text-gray-600 text-[10px] mt-1">{new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <button onClick={() => del(p.id)}
                            className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition mt-1">
                            {t('admin.common.delete')}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── PENDING VENUES (existing logic, improved UI) ───────────────────────────
function VenuesPanel() {
    const { t } = useTranslation();
    const [courts, setCourts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState({});
    const [rejectReason, setRejectReason] = useState({});
    const [showReject, setShowReject] = useState({});
    const [error, setError] = useState(null);
    const [sportFilter, setSportFilter] = useState('all');

    useEffect(() => {
        api.get('/courts/admin/pending')
            .then(r => setCourts(r.data))
            .catch(e => setError(e?.response?.data?.message || e?.message || t('admin.venues.api_error')))
            .finally(() => setLoading(false));
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
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    const reject = async (id) => {
        try {
            await api.patch(`/courts/admin/${id}/reject`, { reason: rejectReason[id] || '' });
            setCourts(prev => prev.filter(c => c.id !== id));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    if (loading) return <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p>;
    if (error) return <p className="text-red-400 text-center py-16 font-bold">{t('admin.common.error_prefix')} {error}</p>;
    if (courts.length === 0) return (
        <div className="text-center py-16 bg-gray-900 rounded-2xl border border-gray-800">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-white font-bold">{t('admin.venues.empty_title')}</p>
            <p className="text-gray-400 text-sm mt-1">{t('admin.venues.empty_subtitle')}</p>
        </div>
    );

    const filtered = sportFilter === 'all' ? courts : courts.filter(c => c.sport === sportFilter);

    return (
        <div className="space-y-4">
            <SportFilterChips items={courts} getSport={c => c.sport} value={sportFilter} onChange={setSportFilter} />
            {filtered.map(court => (
                <div key={court.id} className="bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold">
                            {court.user?.username?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1">
                            <p className="text-white text-sm font-bold">{court.user?.fullName || court.user?.username}</p>
                            <p className="text-gray-500 text-xs">{t('admin.venues.submitted_label', { date: new Date(court.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) })}</p>
                        </div>
                        {court.sport && <span className="text-xs font-bold text-purple-300 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded-full">{court.sport}</span>}
                        <span className="text-xs font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 rounded-full">{t('admin.courts.pending_badge')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-gray-500 text-xs block mb-1">{t('admin.venues.name_col')}</label>{field(court.id, 'name', t('admin.venues.name_ph'), court.name)}</div>
                        <div><label className="text-gray-500 text-xs block mb-1">{t('admin.venues.city_col')}</label>{field(court.id, 'city', t('admin.venues.city_ph'), court.city)}</div>
                        <div><label className="text-gray-500 text-xs block mb-1">{t('admin.venues.district_col')}</label>{field(court.id, 'district', t('admin.venues.district_ph'), court.district)}</div>
                        <div className="col-span-2"><label className="text-gray-500 text-xs block mb-1">{t('admin.venues.address_col')}</label>{field(court.id, 'address', t('admin.venues.address_ph'), court.address)}</div>
                        <div>
                            <label className="text-gray-500 text-xs block mb-1">{t('admin.venues.surface_col')}</label>
                            <select
                                value={editing[court.id]?.surface ?? court.surface ?? ''}
                                onChange={e => setEditing(prev => ({ ...prev, [court.id]: { ...prev[court.id], surface: e.target.value || null } }))}
                                className="w-full bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm border border-gray-700 focus:outline-none focus:border-purple-500">
                                <option value="">{t('admin.common.unspecified_option')}</option>
                                <option value="HARD">{t('admin.common.surface_hard')}</option>
                                <option value="CLAY">{t('admin.common.surface_clay')}</option>
                                <option value="GRASS">{t('admin.common.surface_grass')}</option>
                                <option value="CARPET">{t('admin.common.surface_carpet')}</option>
                                <option value="ARTIFICIAL">{t('admin.common.surface_artificial')}</option>
                                <option value="SAND">{t('admin.common.surface_sand')}</option>
                                <option value="WOOD">{t('admin.common.surface_wood')}</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-gray-500 text-xs block mb-1">{t('admin.venues.indoor_col')}</label>
                            <select
                                value={editing[court.id]?.indoor !== undefined ? String(editing[court.id].indoor) : court.indoor !== undefined ? String(court.indoor) : ''}
                                onChange={e => setEditing(prev => ({ ...prev, [court.id]: { ...prev[court.id], indoor: e.target.value === '' ? null : e.target.value === 'true' } }))}
                                className="w-full bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm border border-gray-700 focus:outline-none focus:border-purple-500">
                                <option value="">{t('admin.common.unspecified_option')}</option>
                                <option value="false">{t('admin.common.outdoor_option')}</option>
                                <option value="true">{t('admin.common.indoor_option')}</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => verify(court)} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-black py-2.5 rounded-xl text-sm transition">{t('admin.venues.approve')}</button>
                        <button onClick={() => setShowReject(p => ({ ...p, [court.id]: !p[court.id] }))} className="flex-1 bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black py-2.5 rounded-xl text-sm transition">{t('admin.venues.reject')}</button>
                    </div>
                    {showReject[court.id] && (
                        <div className="space-y-2">
                            <input value={rejectReason[court.id] || ''} onChange={e => setRejectReason(p => ({ ...p, [court.id]: e.target.value }))}
                                placeholder={t('admin.venues.reject_reason_ph')}
                                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-red-700/40 focus:outline-none" />
                            <button onClick={() => reject(court.id)} className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded-xl text-sm transition">{t('admin.venues.confirm_rejection')}</button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ── NO-SHOW REPORTS ────────────────────────────────────────────────────────
function NoShowPanel() {
    const { t } = useTranslation();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = () => {
        setLoading(true);
        setError(null);
        api.get('/admin/no-show-reports')
            .then(r => setReports(r.data))
            .catch(e => setError(e?.response?.data?.message || e?.message || t('admin.noshow.api_error')))
            .finally(() => setLoading(false));
    };
    useEffect(() => { load(); }, []);

    const approve = async (id) => {
        if (!window.confirm(t('admin.noshow.confirm_approve'))) return;
        try {
            await api.patch(`/admin/no-show-reports/${id}/approve`);
            setReports(prev => prev.filter(r => r.id !== id));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    const reject = async (id) => {
        if (!window.confirm(t('admin.noshow.confirm_reject'))) return;
        try {
            await api.patch(`/admin/no-show-reports/${id}/reject`);
            setReports(prev => prev.filter(r => r.id !== id));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    if (loading) return <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p>;
    if (error) return <p className="text-red-400 text-center py-16 font-bold">{t('admin.common.error_prefix')} {error}</p>;
    if (!reports.length) return <p className="text-gray-500 text-center py-16">{t('admin.noshow.none_pending')}</p>;

    return (
        <div className="space-y-4">
            <p className="text-gray-500 text-xs">{t('admin.noshow.pending_count', { count: reports.length })}</p>
            {reports.map(r => (
                <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm">
                                🏅 {r.rival?.subCategory} · {r.rival?.matchDate ? new Date(r.rival.matchDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '—'} {r.rival?.matchTime || ''}
                            </p>
                            <p className="text-gray-500 text-xs mt-0.5">{t('admin.noshow.reporter', { username: r.reporter?.username })}</p>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                <span className="text-[10px] text-gray-400">{t('admin.noshow.absent_label')}</span>
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
                            {t('admin.noshow.approve_penalty')}
                        </button>
                        <button onClick={() => reject(r.id)}
                            className="flex-1 bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black py-2 rounded-xl text-sm transition">
                            {t('admin.noshow.reject')}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── CITIES ────────────────────────────────────────────────────────────────
function CitiesPanel() {
    const { t } = useTranslation();
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
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    const reject = async (id) => {
        if (!window.confirm(t('admin.cities.confirm_reject'))) return;
        try {
            await api.patch(`/admin/cities/${id}`, { status: 'REJECTED' });
            setCities(prev => prev.filter(c => c.id !== id));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                {['PENDING', 'APPROVED'].map(s => (
                    <button key={s} onClick={() => setFilter(s)}
                        className={`px-4 py-1.5 rounded-xl text-sm font-bold transition border ${filter === s ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                        {s === 'PENDING' ? t('admin.cities.pending_tab') : t('admin.cities.approved_tab')}
                    </button>
                ))}
            </div>
            {loading ? <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p> :
             cities.length === 0 ? (
                <div className="text-center py-16 bg-gray-900 rounded-2xl border border-gray-800">
                    <p className="text-4xl mb-3">✅</p>
                    <p className="text-white font-bold">{t('admin.cities.none_pending')}</p>
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
                                        {t('admin.cities.approve')}
                                    </button>
                                    <button onClick={() => reject(c.id)}
                                        className="px-3 py-1.5 rounded-xl bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black text-xs transition">
                                        {t('admin.cities.reject')}
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

// ── TOURNAMENT PERMISSIONS ────────────────────────────────────────────────
function TournamentPermsPanel() {
    const { t } = useTranslation();
    const [tab, setTab] = useState('PENDING');
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        api.get('/admin/tournament-permissions')
            .then(r => setRequests(r.data))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const approve = async (userId) => {
        try {
            await api.patch(`/admin/tournament-permissions/${userId}/approve`);
            setRequests(prev => prev.map(r => r.userId === userId ? { ...r, status: 'APPROVED' } : r));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    const reject = async (userId) => {
        try {
            await api.patch(`/admin/tournament-permissions/${userId}/reject`);
            setRequests(prev => prev.filter(r => r.userId !== userId));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    const revoke = async (userId) => {
        if (!window.confirm(t('admin.tournamentPerms.confirm_revoke'))) return;
        try {
            await api.delete(`/admin/tournament-permissions/${userId}/revoke`);
            setRequests(prev => prev.filter(r => r.userId !== userId));
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    const filtered = requests.filter(r => r.status === tab);

    return (
        <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-2">
                {[['PENDING', t('admin.tournamentPerms.pending_tab')], ['APPROVED', t('admin.tournamentPerms.approved_tab')]].map(([s, label]) => (
                    <button key={s} onClick={() => setTab(s)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition border ${
                            tab === s
                                ? s === 'PENDING'
                                    ? 'bg-yellow-900/40 border-yellow-700/60 text-yellow-400'
                                    : 'bg-green-900/40 border-green-700/60 text-green-400'
                                : 'bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300'
                        }`}>
                        {label}
                        <span className="ml-1.5 opacity-70">({requests.filter(r => r.status === s).length})</span>
                    </button>
                ))}
            </div>

            {loading ? (
                <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 bg-gray-900 rounded-2xl border border-gray-800">
                    <p className="text-4xl mb-3">{tab === 'PENDING' ? '✅' : '📭'}</p>
                    <p className="text-white font-bold">
                        {tab === 'PENDING' ? t('admin.tournamentPerms.none_pending') : t('admin.tournamentPerms.none_approved')}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-gray-500 text-xs">{t('admin.tournamentPerms.count_label', { count: filtered.length })}</p>
                    {filtered.map(r => (
                        <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-black flex-shrink-0">
                                {r.user?.username?.[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-bold text-sm">@{r.user?.username}</p>
                                {r.user?.fullName && <p className="text-gray-400 text-xs">{r.user.fullName}</p>}
                                <p className="text-gray-600 text-[10px] mt-0.5">{new Date(r.createdAt).toLocaleString('tr-TR')}</p>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                                {tab === 'PENDING' ? (<>
                                    <button onClick={() => approve(r.userId)}
                                        className="px-3 py-1.5 rounded-xl bg-green-900/40 hover:bg-green-900/60 border border-green-700/50 text-green-400 font-black text-xs transition">
                                        {t('admin.tournamentPerms.approve')}
                                    </button>
                                    <button onClick={() => reject(r.userId)}
                                        className="px-3 py-1.5 rounded-xl bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black text-xs transition">
                                        {t('admin.tournamentPerms.reject')}
                                    </button>
                                </>) : (
                                    <button onClick={() => revoke(r.userId)}
                                        className="px-3 py-1.5 rounded-xl bg-orange-900/40 hover:bg-orange-900/60 border border-orange-700/50 text-orange-400 font-black text-xs transition">
                                        {t('admin.tournamentPerms.revoke')}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── FLAGGED LISTINGS ──────────────────────────────────────────────────────
function FlaggedListingsPanel() {
    const { t } = useTranslation();
    const [data, setData] = useState({ equipment: [], coaches: [] });
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        api.get('/admin/flagged-listings').then(r => setData(r.data)).finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const moderate = async (type, id, action) => {
        try {
            await api.patch(`/admin/listings/${type}/${id}`, { action });
            load();
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    if (loading) return <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p>;

    const all = [
        ...data.equipment.map(e => ({ ...e, _type: 'equipment', _label: t('admin.flaggedListings.equipment_label') })),
        ...data.coaches.map(c => ({ ...c, _type: 'coach', _label: t('admin.flaggedListings.coach_label') })),
    ].sort((a, b) => b.reportCount - a.reportCount);

    if (all.length === 0) return <p className="text-gray-500 text-center py-16">{t('admin.flaggedListings.none')}</p>;

    return (
        <div className="space-y-3">
            {all.map(item => (
                <div key={item.id} className="bg-gray-900 border border-yellow-700/40 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-black text-yellow-400 bg-yellow-900/40 border border-yellow-700/50 rounded-lg px-2 py-0.5">{item._label}</span>
                                <span className="text-red-400 text-xs font-black">{t('admin.flaggedListings.report_count', { count: item.reportCount })}</span>
                            </div>
                            <p className="text-white font-bold text-sm truncate">{item.title || item.credentialLevel || '—'}</p>
                            <p className="text-gray-500 text-xs">@{item.user?.username}</p>
                            {item.images?.[0] && (
                                <img src={item.images[0]} alt="" className="w-24 h-16 object-cover rounded-lg mt-2 border border-gray-700" />
                            )}
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                            <button onClick={() => moderate(item._type, item.id, 'RESTORE')}
                                className="px-3 py-1.5 rounded-xl bg-green-900/40 hover:bg-green-900/60 border border-green-700/50 text-green-400 font-black text-xs transition">
                                {t('admin.flaggedListings.clean')}
                            </button>
                            <button onClick={() => window.confirm(t('admin.flaggedListings.confirm_remove')) && moderate(item._type, item.id, 'REMOVE')}
                                className="px-3 py-1.5 rounded-xl bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black text-xs transition">
                                {t('admin.flaggedListings.remove')}
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── PROFİL DEĞİŞİKLİK TALEPLERİ ──────────────────────────────────────────
function ProfileChangesPanel() {
    const { t } = useTranslation();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [notes, setNotes] = useState({}); // id → note text

    const load = useCallback(() => {
        setLoading(true);
        api.get(`/admin/profile-changes?status=${statusFilter}`)
            .then(r => setRequests(r.data))
            .finally(() => setLoading(false));
    }, [statusFilter]);

    useEffect(() => { load(); }, [load]);

    const review = async (id, action) => {
        try {
            await api.patch(`/admin/profile-changes/${id}`, { action, adminNote: notes[id] || '' });
            load();
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    const FIELD_LABEL = { fullName: t('admin.profileChanges.field_fullName'), gender: t('admin.profileChanges.field_gender'), birthDate: t('admin.profileChanges.field_birthDate') };

    return (
        <div className="space-y-4">
            <div className="flex gap-2 mb-4">
                {['PENDING', 'APPROVED', 'REJECTED'].map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                        className={`px-4 py-1.5 rounded-xl text-sm font-bold transition border ${statusFilter === s ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                        {s === 'PENDING' ? t('admin.profileChanges.pending_tab') : s === 'APPROVED' ? t('admin.profileChanges.approved_tab') : t('admin.profileChanges.rejected_tab')}
                    </button>
                ))}
            </div>

            {loading && <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p>}
            {!loading && requests.length === 0 && (
                <p className="text-gray-500 text-center py-16">
                    {statusFilter === 'PENDING' ? t('admin.profileChanges.none_pending') : t('admin.profileChanges.none_found')}
                </p>
            )}

            {requests.map(req => (
                <div key={req.id} className="bg-gray-900 border border-purple-700/30 rounded-2xl p-5">
                    <div className="flex items-start gap-4">
                        {req.user?.avatar && (
                            <img src={req.user.avatar} alt="" className="w-10 h-10 rounded-full object-cover border border-gray-700 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                                <span className="text-white font-bold text-sm">{req.user?.fullName || req.user?.username}</span>
                                <span className="text-gray-500 text-xs">{req.user?.username}</span>
                                <span className="text-xs font-black text-purple-400 bg-purple-900/40 border border-purple-700/50 rounded-lg px-2 py-0.5">
                                    {FIELD_LABEL[req.field] || req.field}
                                </span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${req.status === 'PENDING' ? 'text-yellow-400 bg-yellow-900/30 border-yellow-700/50' : req.status === 'APPROVED' ? 'text-green-400 bg-green-900/30 border-green-700/50' : 'text-red-400 bg-red-900/30 border-red-700/50'}`}>
                                    {req.status}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="bg-gray-800 rounded-xl p-3">
                                    <p className="text-gray-500 text-xs mb-1">{t('admin.profileChanges.current_value')}</p>
                                    <p className="text-gray-300 text-sm font-bold">{req.currentValue || '—'}</p>
                                </div>
                                <div className="bg-gray-800 rounded-xl p-3">
                                    <p className="text-gray-500 text-xs mb-1">{t('admin.profileChanges.new_value')}</p>
                                    <p className="text-white text-sm font-black">{req.newValue || '—'}</p>
                                </div>
                            </div>

                            {req.documentUrl && (
                                <a href={req.documentUrl} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-blue-400 text-xs font-bold hover:text-blue-300 mb-3">
                                    {t('admin.profileChanges.view_document')}
                                </a>
                            )}

                            <p className="text-gray-600 text-xs mb-3">
                                {new Date(req.createdAt).toLocaleString('tr-TR')}
                            </p>

                            {req.status === 'PENDING' && (
                                <div className="flex flex-col gap-2">
                                    <input
                                        value={notes[req.id] || ''}
                                        onChange={e => setNotes(n => ({ ...n, [req.id]: e.target.value }))}
                                        placeholder={t('admin.profileChanges.reject_note_ph')}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => review(req.id, 'APPROVE')}
                                            className="flex-1 py-2 rounded-xl bg-green-900/40 hover:bg-green-900/60 border border-green-700/50 text-green-400 font-black text-sm transition">
                                            {t('admin.profileChanges.approve')}
                                        </button>
                                        <button onClick={() => review(req.id, 'REJECT')}
                                            className="flex-1 py-2 rounded-xl bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black text-sm transition">
                                            {t('admin.profileChanges.reject')}
                                        </button>
                                    </div>
                                </div>
                            )}
                            {req.adminNote && (
                                <p className="text-gray-500 text-xs mt-2 italic">{t('admin.common.note_prefix')} {req.adminNote}</p>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── TESİS YORUMU ONAYI ─────────────────────────────────────────────────────
function VenueReviewsPanel() {
    const { t } = useTranslation();
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [notes, setNotes] = useState({}); // id → note text

    const load = useCallback(() => {
        setLoading(true);
        api.get(`/admin/venue-reviews?status=${statusFilter}`)
            .then(r => setReviews(r.data))
            .finally(() => setLoading(false));
    }, [statusFilter]);

    useEffect(() => { load(); }, [load]);

    const resolve = async (id, action) => {
        try {
            await api.patch(`/admin/venue-reviews/${id}`, { action, adminNote: notes[id] || '' });
            load();
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2 mb-4">
                {['PENDING', 'APPROVED', 'REJECTED'].map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                        className={`px-4 py-1.5 rounded-xl text-sm font-bold transition border ${statusFilter === s ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                        {s === 'PENDING' ? t('admin.venueReviews.pending_tab') : s === 'APPROVED' ? t('admin.venueReviews.approved_tab') : t('admin.venueReviews.rejected_tab')}
                    </button>
                ))}
            </div>

            {loading && <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p>}
            {!loading && reviews.length === 0 && (
                <p className="text-gray-500 text-center py-16">{t('admin.venueReviews.none_found')}</p>
            )}

            {reviews.map(r => (
                <div key={r.id} className="bg-gray-900 border border-purple-700/30 rounded-2xl p-5">
                    <div className="flex items-start gap-4">
                        {r.user?.avatar && (
                            <img src={r.user.avatar} alt="" className="w-10 h-10 rounded-full object-cover border border-gray-700 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                                <span className="text-white font-bold text-sm">{r.venue?.name || '?'}{r.court ? ` · ${r.court.name}` : ` · ${t('admin.venueReviews.general_venue')}`}</span>
                                <span className="text-gray-500 text-xs">@{r.user?.username}</span>
                                <span className="text-yellow-400 text-xs font-bold">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                            </div>
                            {r.comment && <p className="text-gray-300 text-sm mb-2">{r.comment}</p>}
                            <p className="text-gray-600 text-xs mb-3">{new Date(r.createdAt).toLocaleString('tr-TR')}</p>

                            {statusFilter === 'PENDING' && (
                                <div className="flex flex-col gap-2">
                                    <input
                                        value={notes[r.id] || ''}
                                        onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))}
                                        placeholder={t('admin.venueReviews.reject_note_ph')}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => resolve(r.id, 'APPROVE')}
                                            className="flex-1 py-2 rounded-xl bg-green-900/40 hover:bg-green-900/60 border border-green-700/50 text-green-400 font-black text-sm transition">
                                            {t('admin.venueReviews.approve')}
                                        </button>
                                        <button onClick={() => resolve(r.id, 'REJECT')}
                                            className="flex-1 py-2 rounded-xl bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black text-sm transition">
                                            {t('admin.venueReviews.reject')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── ABONELİK TALEPLERİ ─────────────────────────────────────────────────────
function SubscriptionsPanel() {
    const { t } = useTranslation();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionId, setActionId] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        api.get('/subscriptions/requests').then(r => setRequests(r.data)).catch(() => {}).finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const approve = async (id) => {
        setActionId(id);
        try { await api.patch(`/subscriptions/requests/${id}/approve`); load(); }
        catch (e) { alert(e?.response?.data?.message || 'Hata'); }
        finally { setActionId(null); }
    };

    const reject = async (id) => {
        const note = window.prompt(t('subscriptions.reject_reason_prompt', { defaultValue: 'Red nedeni (isteğe bağlı):' }));
        if (note === null) return;
        setActionId(id);
        try { await api.patch(`/subscriptions/requests/${id}/reject`, { adminNote: note || null }); load(); }
        catch (e) { alert(e?.response?.data?.message || 'Hata'); }
        finally { setActionId(null); }
    };

    if (loading) return <p className="text-gray-500 text-center py-16">{t('subscriptions.loading', { defaultValue: 'Yükleniyor...' })}</p>;
    if (!requests.length) return <p className="text-gray-500 text-center py-16">{t('subscriptions.no_requests', { defaultValue: 'Bekleyen abonelik talebi yok.' })}</p>;

    return (
        <div className="space-y-4">
            <p className="text-gray-400 text-sm">
                {requests.length === 1
                    ? t('subscriptions.pending_count', { count: requests.length, defaultValue: '1 bekleyen talep' })
                    : t('subscriptions.pending_count_plural', { count: requests.length, defaultValue: `${requests.length} bekleyen talep` })}
            </p>
            {requests.map(req => {
                const createdTime = new Date(req.createdAt).getTime();
                const limitTime = createdTime + 24 * 60 * 60 * 1000;
                const isExpired = !req.receiptUrl && Date.now() > limitTime;
                const hoursLeft = Math.max(0, Math.floor((limitTime - Date.now()) / (1000 * 60 * 60)));
                const minsLeft = Math.max(0, Math.floor(((limitTime - Date.now()) % (1000 * 60 * 60)) / (1000 * 60)));

                return (
                    <div key={req.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-white font-black">{req.user?.businessName || req.user?.fullName || req.user?.username}</p>
                                <p className="text-gray-400 text-xs">@{req.user?.username} · {req.user?.email}</p>
                                <p className="text-amber-400 text-xs font-bold mt-1">
                                    {req.packageType} · {new Date(req.createdAt).toLocaleString('tr-TR')}
                                </p>
                            </div>
                            <span className="bg-yellow-900/40 border border-yellow-700/50 text-yellow-400 text-xs font-black px-3 py-1 rounded-full">
                                {t('subscriptions.status_pending', { defaultValue: 'BEKLIYOR' })}
                            </span>
                        </div>

                        {/* Dekont */}
                        {req.receiptUrl ? (
                            <a href={req.receiptUrl} target="_blank" rel="noreferrer">
                                <img src={req.receiptUrl} alt="dekont" className="w-full max-h-64 object-contain rounded-xl border border-gray-700 cursor-pointer hover:opacity-90 transition" />
                            </a>
                        ) : isExpired ? (
                            <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-4 text-center text-red-400 text-sm font-semibold">
                                {t('subscriptions.receipt_expired', { defaultValue: '⚠️ 24 saatlik dekont yükleme süresi doldu! (Dekont Yüklenmedi)' })}
                            </div>
                        ) : (
                            <div className="bg-gray-800/40 border border-gray-800 rounded-xl p-4 text-center text-gray-400 text-sm">
                                {t('subscriptions.receipt_not_uploaded', {
                                    hours: hoursLeft,
                                    minutes: minsLeft,
                                    defaultValue: `📎 Dekont henüz yüklenmedi (Kalan süre: ${hoursLeft} saat ${minsLeft} dakika)`
                                })}
                            </div>
                        )}

                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={() => approve(req.id)}
                                disabled={actionId === req.id}
                                className="flex-1 py-2.5 rounded-xl bg-green-900/40 hover:bg-green-900/60 border border-green-700/50 text-green-400 font-black text-sm transition disabled:opacity-50">
                                {t('subscriptions.approve', { defaultValue: '✅ Onayla — Aboneliği Başlat' })}
                            </button>
                            <button
                                onClick={() => reject(req.id)}
                                disabled={actionId === req.id}
                                className="flex-1 py-2.5 rounded-xl bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black text-sm transition disabled:opacity-50">
                                {t('subscriptions.reject', { defaultValue: '❌ Reddet' })}
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ── İŞLETME TESİSLERİ ─────────────────────────────────────────────────────
function BusinessVenuesPanel() {
    const { t } = useTranslation();
    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionId, setActionId] = useState(null);
    const [sportFilter, setSportFilter] = useState('all');
    // Eskiden bu panel sadece PENDING (onay bekleyen) tesisleri gösteriyordu — onaylanmış
    // (PRO paket dahil, aktif) tesislerin kortları/sahaları admin panelinde HİÇBİR YERDE
    // görünmüyordu. Varsayılan artık "Tümü", isteyen sadece bekleyenleri de filtreleyebilir.
    const [statusFilter, setStatusFilter] = useState('ALL');

    const load = useCallback(() => {
        setLoading(true);
        api.get('/venues/admin/pending', { params: { status: statusFilter } }).then(r => setVenues(r.data)).catch(() => {}).finally(() => setLoading(false));
    }, [statusFilter]);

    useEffect(() => { load(); }, [load]);

    const approve = async (id) => {
        setActionId(id);
        try { await api.patch(`/venues/${id}/approve`); load(); }
        catch (e) { alert(e?.response?.data?.message || t('admin.bizVenues.action_failed')); }
        finally { setActionId(null); }
    };

    const reject = async (id) => {
        const note = window.prompt(t('admin.bizVenues.reject_note_ph'));
        if (note === null) return;
        setActionId(id);
        try { await api.patch(`/venues/${id}/reject`, { adminNote: note || null }); load(); }
        catch (e) { alert(e?.response?.data?.message || t('admin.bizVenues.action_failed')); }
        finally { setActionId(null); }
    };

    // Mobil "Eksik Bilgileri Tamamla" formundan (suggestVenueEdit) gelen, zaten onaylı bir
    // tesisin eksik bilgisini tamamlayan öneriler burada onaylanıp gerçek alanlara uygulanır.
    const approveEdit = async (id) => {
        setActionId(id);
        try { await api.patch(`/venues/${id}/approve-edit`); load(); }
        catch (e) { alert(e?.response?.data?.message || t('admin.bizVenues.action_failed')); }
        finally { setActionId(null); }
    };
    const rejectEdit = async (id) => {
        const note = window.prompt(t('admin.common.reject_note_placeholder'));
        if (note === null) return;
        setActionId(id);
        try { await api.patch(`/venues/${id}/reject-edit`, { adminNote: note || null }); load(); }
        catch (e) { alert(e?.response?.data?.message || t('admin.bizVenues.action_failed')); }
        finally { setActionId(null); }
    };

    const SLOT_LABELS = { FULL_HOUR: t('admin.bizVenues.slot_full_hour'), HALF_HOUR: t('admin.bizVenues.slot_half_hour'), FLEXIBLE: t('admin.bizVenues.slot_flexible') };
    const DAY_NAMES = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

    const STATUS_LABEL = { PENDING: t('admin.bizVenues.status_pending'), APPROVED: t('admin.bizVenues.status_approved'), REJECTED: t('admin.bizVenues.status_rejected'), ALL: t('admin.bizVenues.status_all') };
    const statusBadge = (status) => ({
        PENDING:  'bg-yellow-900/40 border border-yellow-700/50 text-yellow-400',
        APPROVED: 'bg-green-900/40 border border-green-700/50 text-green-400',
        REJECTED: 'bg-red-900/40 border border-red-700/50 text-red-400',
    }[status] || 'bg-gray-800 border border-gray-700 text-gray-400');

    if (loading) return <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p>;

    const filtered = sportFilter === 'all' ? venues : venues.filter(v => v.branch === sportFilter);

    return (
        <div className="space-y-5">
            <div className="flex gap-2">
                {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(st => (
                    <button key={st} onClick={() => setStatusFilter(st)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${statusFilter === st ? 'bg-purple-500/20 border-purple-500 text-purple-300' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                        {STATUS_LABEL[st]}
                    </button>
                ))}
            </div>
            <SportFilterChips items={venues} getSport={v => v.branch} value={sportFilter} onChange={setSportFilter} />
            {!venues.length ? (
                <div className="text-center py-16 bg-gray-900 rounded-2xl border border-gray-800">
                    <p className="text-4xl mb-3">✅</p>
                    <p className="text-white font-bold">{t('admin.bizVenues.none_in_filter')}</p>
                </div>
            ) : (
            <>
            <p className="text-gray-400 text-sm">{t('admin.bizVenues.count_label', { count: filtered.length })}</p>
            {filtered.map(v => (
                <div key={v.id} className="bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-white font-black text-lg">{v.name}</p>
                            <p className="text-amber-400 text-xs font-bold">{v.branch} · {v.city}{v.district ? ` / ${v.district}` : ''}</p>
                            <p className="text-gray-400 text-xs mt-1">
                                {t('admin.bizVenues.business_label')} <span className="text-white font-bold">{v.user?.businessName || v.user?.username}</span>
                                {' · '}{v.user?.email}
                            </p>
                        </div>
                        <span className={`text-xs font-black px-3 py-1 rounded-full ${statusBadge(v.status)}`}>{v.status}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-gray-800 rounded-xl p-3">
                            <p className="text-gray-500 text-xs font-bold mb-1">{t('admin.bizVenues.address_label')}</p>
                            <p className="text-white">{v.address || '—'}</p>
                            {v.phone && <p className="text-gray-400 text-xs mt-1">📞 {v.phone}</p>}
                        </div>
                        <div className="bg-gray-800 rounded-xl p-3">
                            <p className="text-gray-500 text-xs font-bold mb-1">{t('admin.bizVenues.hours_type_label')}</p>
                            <p className="text-white">{v.openTime} – {v.closeTime}</p>
                            <p className="text-amber-400 text-xs mt-1">{SLOT_LABELS[v.slotType] || v.slotType}</p>
                        </div>
                    </div>

                    <div className="bg-gray-800 rounded-xl p-3">
                        <p className="text-gray-500 text-xs font-bold mb-2">{t('admin.bizVenues.open_days_label')}</p>
                        <div className="flex gap-2 flex-wrap">
                            {(v.openDays || []).map(d => (
                                <span key={d} className="bg-amber-900/40 border border-amber-700/50 text-amber-400 text-xs font-bold px-2 py-1 rounded-lg">{DAY_NAMES[d]}</span>
                            ))}
                        </div>
                    </div>

                    <div className="bg-gray-800 rounded-xl p-3">
                        <p className="text-gray-500 text-xs font-bold mb-2">{t('admin.bizVenues.courts_label', { count: v.courts?.length || 0 })}</p>
                        <div className="flex gap-2 flex-wrap">
                            {(v.courts || []).map(c => (
                                <span key={c.id} className="bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded-lg">{c.name}</span>
                            ))}
                        </div>
                    </div>

                    {v.pendingEdit && (
                        <div className="bg-purple-950/30 border border-purple-500/40 rounded-xl p-3 space-y-1.5">
                            <p className="text-purple-300 text-xs font-bold">{t('admin.bizVenues.pending_edit_title')}</p>
                            <div className="text-gray-300 text-xs space-y-0.5">
                                {v.pendingEdit.name && <p>{t('admin.bizVenues.field_name')}: {v.pendingEdit.name}</p>}
                                {v.pendingEdit.district && <p>{t('admin.bizVenues.field_district')}: {v.pendingEdit.district}</p>}
                                {v.pendingEdit.address && <p>{t('admin.bizVenues.field_address')}: {v.pendingEdit.address}</p>}
                                {v.pendingEdit.phone && <p>{t('admin.bizVenues.field_phone')}: {v.pendingEdit.phone}</p>}
                                {v.pendingEdit.courtCount != null && <p>{t('admin.bizVenues.field_court_count')}: {v.pendingEdit.courtCount}</p>}
                                {(v.pendingEdit.openTime || v.pendingEdit.closeTime) && <p>{t('admin.bizVenues.field_hours')}: {v.pendingEdit.openTime || v.openTime} – {v.pendingEdit.closeTime || v.closeTime}</p>}
                                {v.pendingEdit.openDays && <p>{t('admin.bizVenues.field_days')}: {v.pendingEdit.openDays.join(', ')}</p>}
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button onClick={() => approveEdit(v.id)} disabled={actionId === v.id}
                                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg border bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 transition disabled:opacity-50">
                                    {t('admin.bizVenues.approve_edit')}
                                </button>
                                <button onClick={() => rejectEdit(v.id)} disabled={actionId === v.id}
                                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50">
                                    {t('admin.bizVenues.reject_edit')}
                                </button>
                            </div>
                        </div>
                    )}

                    <p className="text-gray-500 text-xs">{t('admin.bizVenues.application_date', { date: new Date(v.createdAt).toLocaleString('tr-TR') })}</p>

                    {v.status === 'PENDING' && (
                        <div className="flex gap-3">
                            <button
                                onClick={() => approve(v.id)}
                                disabled={actionId === v.id}
                                className="flex-1 py-2.5 rounded-xl bg-green-900/40 hover:bg-green-900/60 border border-green-700/50 text-green-400 font-black text-sm transition disabled:opacity-50">
                                {t('admin.bizVenues.approve')}
                            </button>
                            <button
                                onClick={() => reject(v.id)}
                                disabled={actionId === v.id}
                                className="flex-1 py-2.5 rounded-xl bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black text-sm transition disabled:opacity-50">
                                {t('admin.bizVenues.reject')}
                            </button>
                        </div>
                    )}
                </div>
            ))}
            </>
            )}
        </div>
    );
}

// ── ANTRENÖRLÜK / HAKEMLİK ONAY KUYRUKLARI ──────────────────────────────────
// Mobil AdminPortalScreen.js'deki CoachListingApprovalTab/RefereeApprovalTab/
// CoachRatingApprovalTab ile aynı davranış — üçü de PENDING/APPROVED filtresine göre
// backend'den liste çekip Onayla/Onayı Kaldır eylemi sunuyor, tek şablonla paylaşılıyor.
function ApprovalQueuePanel({ endpoint, showCv = true, allowReject = false, emptyPendingText, emptyOtherText }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('PENDING');
    // Kullanıcı isteği: reddederken bir açıklama yazılabilsin, kullanıcıya bu sebeple
    // bildirim gitsin — ProfileChangesPanel'deki "Red notu" alanıyla aynı desen.
    const [notes, setNotes] = useState({}); // id → not metni

    const load = useCallback(() => {
        setLoading(true);
        api.get(`${endpoint}?status=${filter}`).then(r => setItems(Array.isArray(r.data) ? r.data : [])).finally(() => setLoading(false));
    }, [endpoint, filter]);

    useEffect(() => { load(); }, [load]);

    const setApproval = async (id, action) => {
        try {
            await api.patch(`${endpoint}/${id}`, { action, adminNote: notes[id] || '' });
            load();
        } catch (e) { alert(e?.response?.data?.message || t('admin.common.error')); }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2 mb-4">
                {['PENDING', 'APPROVED'].map(s => (
                    <button key={s} onClick={() => setFilter(s)}
                        className={`px-4 py-1.5 rounded-xl text-sm font-bold transition border ${filter === s ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                        {s === 'PENDING' ? t('admin.approvalQueue.pending_tab') : t('admin.approvalQueue.approved_tab')}
                    </button>
                ))}
            </div>

            {loading && <p className="text-gray-500 text-center py-16">{t('admin.common.loading')}</p>}
            {!loading && items.length === 0 && (
                <p className="text-gray-500 text-center py-16">{filter === 'PENDING' ? emptyPendingText : emptyOtherText}</p>
            )}

            {items.map(c => (
                <div key={c.id} className="bg-gray-900 border border-purple-700/30 rounded-2xl p-5">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-white font-bold text-sm">@{c.user?.username || '?'}</p>
                            {c.user?.fullName && <p className="text-gray-500 text-xs">{c.user.fullName}</p>}
                            <p className="text-gray-400 text-xs">{c.subCategory} · {c.credentialLevel}</p>
                            <p className="text-gray-500 text-xs">
                                {Array.isArray(c.cities) && c.cities.length > 0 ? c.cities.join(', ') : (c.city || c.location || '—')}
                            </p>
                            {showCv && (
                                c.cvUrl ? (
                                    <a href={c.cvUrl} target="_blank" rel="noreferrer" className="text-purple-400 text-xs font-bold hover:underline">{t('admin.approvalQueue.view_cv')}</a>
                                ) : (
                                    <p className="text-red-400 text-xs">{t('admin.approvalQueue.no_cv')}</p>
                                )
                            )}
                        </div>
                        {!(allowReject && filter === 'PENDING') && (
                            <div className="shrink-0">
                                {filter === 'PENDING' ? (
                                    <button onClick={() => setApproval(c.id, 'APPROVE')}
                                        className="px-3 py-1.5 rounded-xl bg-green-900/40 hover:bg-green-900/60 border border-green-700/50 text-green-400 font-black text-xs transition">
                                        {t('admin.approvalQueue.approve')}
                                    </button>
                                ) : (
                                    <button onClick={() => setApproval(c.id, 'REVOKE')}
                                        className="px-3 py-1.5 rounded-xl bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black text-xs transition">
                                        {t('admin.approvalQueue.revoke')}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    {allowReject && filter === 'PENDING' && (
                        <div className="flex flex-col gap-2 mt-3">
                            <input
                                value={notes[c.id] || ''}
                                onChange={e => setNotes(n => ({ ...n, [c.id]: e.target.value }))}
                                placeholder={t('admin.approvalQueue.reject_note_ph')}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                            />
                            <div className="flex gap-2">
                                <button onClick={() => setApproval(c.id, 'APPROVE')}
                                    className="flex-1 py-2 rounded-xl bg-green-900/40 hover:bg-green-900/60 border border-green-700/50 text-green-400 font-black text-sm transition">
                                    {t('admin.approvalQueue.approve')}
                                </button>
                                <button onClick={() => setApproval(c.id, 'REJECT')}
                                    className="flex-1 py-2 rounded-xl bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-400 font-black text-sm transition">
                                    {t('admin.approvalQueue.reject')}
                                </button>
                            </div>
                        </div>
                    )}
                    {c.adminNote && (
                        <p className="text-gray-500 text-xs mt-2 italic">{t('admin.common.note_prefix')} {c.adminNote}</p>
                    )}
                </div>
            ))}
        </div>
    );
}

function CoachListingApprovalPanel() {
    const { t } = useTranslation();
    return <ApprovalQueuePanel endpoint="/admin/coach-listing-approvals" allowReject
        emptyPendingText={t('admin.approvalQueue.coachListing_empty_pending')} emptyOtherText={t('admin.approvalQueue.coachListing_empty_other')} />;
}

function RefereeApprovalPanel() {
    const { t } = useTranslation();
    return <ApprovalQueuePanel endpoint="/admin/referee-approvals"
        emptyPendingText={t('admin.approvalQueue.referee_empty_pending')} emptyOtherText={t('admin.approvalQueue.referee_empty_other')} />;
}

function CoachRatingApprovalPanel() {
    const { t } = useTranslation();
    // Bu onay diğer ikisinden farklı — CV'ye bakılmıyor, "bu antrenör oyuncu
    // değerlendirmesi verebilir mi" onayı (bkz. VolleyballRating, approvedForRating).
    return <ApprovalQueuePanel endpoint="/admin/coach-rating-approvals" showCv={false}
        emptyPendingText={t('admin.approvalQueue.coachRating_empty_pending')} emptyOtherText={t('admin.approvalQueue.coachRating_empty_other')} />;
}

// ── MAIN ───────────────────────────────────────────────────────────────────
export default function AdminPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const user = useSelector(s => s.auth.user);
    const [activeTab, setActiveTab] = useState(TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'dashboard');
    const pendingCounts = usePendingCounts();

    useEffect(() => {
        if (user && !user.isAdmin) navigate('/home');
    }, [user]);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && TABS.includes(tab)) setActiveTab(tab);
    }, [searchParams]);

    const dynamicTabLabels = Object.fromEntries(TABS.map(tab => [tab, t(`admin.tabs.${tab}`)]));

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar />
            <div className="flex gap-0 min-h-[calc(100vh-57px)]">

                {/* Sidebar */}
                <div className="w-52 shrink-0 bg-gray-900 border-r border-gray-800 p-3 space-y-1 overflow-y-auto">
                    <div className="px-3 py-2 mb-2">
                        <p className="text-yellow-400 font-black text-sm">{t('admin.sidebar_title')}</p>
                        <p className="text-gray-600 text-[10px]">@{user?.username}</p>
                    </div>
                    {TABS.map(tab => {
                        const count = pendingCounts[tab] || 0;
                        return (
                            <button key={tab} onClick={() => setActiveTab(tab)}
                                className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition ${activeTab === tab ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
                                {dynamicTabLabels[tab]}
                                {/* Kullanıcı isteği: bekleyen sayısı parantez içinde, > 0 iken
                                    yanıp sönerek dikkat çeksin — onaylar bekletilmesin. */}
                                {count > 0 && (
                                    <span className="ml-1.5 text-red-400 font-black animate-pulse">
                                        ({count > 99 ? '99+' : count})
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="flex-1 p-6 overflow-y-auto">
                    <h2 className="text-white font-black text-xl mb-6">{dynamicTabLabels[activeTab]}</h2>
                    {activeTab === 'dashboard' && <Dashboard />}
                    {activeTab === 'users'     && <UsersPanel />}
                    {activeTab === 'courts'    && <CourtsPanel />}
                    {activeTab === 'disputes'  && <DisputesPanel />}
                    {activeTab === 'posts'     && <PostsPanel />}
                    {activeTab === 'venues'     && <VenuesPanel />}
                    {activeTab === 'biz-venues' && <BusinessVenuesPanel />}
                    {activeTab === 'noshow'            && <NoShowPanel />}
                    {activeTab === 'cities'            && <CitiesPanel />}
                    {activeTab === 'tournament-perms'  && <TournamentPermsPanel />}
                    {activeTab === 'flagged-listings'  && <FlaggedListingsPanel />}
                    {activeTab === 'profile-changes'  && <ProfileChangesPanel />}
                    {activeTab === 'subscriptions'    && <SubscriptionsPanel />}
                    {activeTab === 'venue-reviews'    && <VenueReviewsPanel />}
                    {activeTab === 'coach-listing-approval' && <CoachListingApprovalPanel />}
                    {activeTab === 'referee-approval'       && <RefereeApprovalPanel />}
                    {activeTab === 'coach-rating-approval'  && <CoachRatingApprovalPanel />}
                </div>
            </div>
        </div>
    );
}
