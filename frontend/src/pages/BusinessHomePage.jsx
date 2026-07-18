import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../store/slices/authSlice';
import api from '../services/api';
import Navbar from '../components/Navbar';

const BRANCHES = [
    'football','tennis','padel','basketball','volleyball','badminton','swimming','boxing','martial_arts','wellness',
    'cycling','running','table_tennis','climbing','archery','walking','foot_tennis','sup_kano','handball',
    'shooting_hunting','equestrian','golf','fitness_gym','skiing_snowboard','ice_skating','hiking','camping',
    'motorcycle','extreme_sports','paintball','airsoft',
];
const PACKAGES = [
    { key: 'STARTER',     icon: '🏅', name: 'Başlangıç Paketi', price: '399',
      features: ['Turnuva oluşturma yetkisi', 'Kortlarını turnuvaya ekleme', 'Turnuva maçlarına kort atama'] },
    { key: 'RAHATLATICI', icon: '🌿', name: 'Rahatlatıcı Paket', price: '999',
      features: ['Turnuva oluşturma yetkisi', 'Tesis & kort ekleme (max 1 tesis / 3 kort)', 'Uygulama üzerinden online rezervasyon'] },
    { key: 'PRO',         icon: '🚀', name: 'Pro Paket', price: '1999',
      features: ['Max 2 tesis / 8 kort', 'Ödeme yöntemine göre fiyat farkı', 'Gelişmiş rapor'] },
    { key: 'PREMIUM',     icon: '💎', name: 'Premium Paket', price: '3499',
      features: ['Max 3 tesis / 15 kort', 'Tüm Pro özellikleri', 'Öncelikli destek'] },
];
const PAY_LABEL = { CASH: '💵 Nakit', EFT: '🏦 EFT/Havale', CREDIT_CARD: '💳 Kredi Kartı' };
const APPROVAL_LABEL = { FULL_AUTO: 'Otomatik Onay', EFT_TIMED: 'EFT + Süreli Onay', PAYMENT_AUTO: 'Ödeme ile Otomatik', MANUAL: 'Manuel Onay' };

function pad(n) { return String(n).padStart(2, '0'); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// ── Abonelik modalı ──
function SubscriptionModal({ open, onClose, sub, pendingRequest, onPurchase, onUploadReceipt, onCancel, submitting, uploading, cancelling }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-black text-lg">📋 Abonelik Paketleri</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                {sub && (
                    <div className="bg-green-600/10 border border-green-500/40 rounded-xl p-4 mb-4">
                        <p className="text-green-400 font-bold text-sm mb-2">✅ {PACKAGES.find(p => p.key === sub.packageType)?.name || sub.packageType} aktif</p>
                        <button onClick={onCancel} disabled={cancelling}
                            className="text-red-400 text-xs font-bold border border-red-500/40 rounded-lg px-3 py-1.5 hover:bg-red-500/10 transition disabled:opacity-50">
                            {cancelling ? '...' : 'Aboneliği İptal Et'}
                        </button>
                    </div>
                )}

                {pendingRequest && !pendingRequest.receiptUrl && (
                    <div className="bg-yellow-600/10 border border-yellow-500/40 rounded-xl p-4 mb-4">
                        <p className="text-yellow-400 font-bold text-sm mb-2">⏳ {PACKAGES.find(p => p.key === pendingRequest.packageType)?.name} talebi gönderildi — ödeme dekontunu yükle.</p>
                        <p className="text-gray-400 text-xs mb-3">EFT: {'{Banka bilgisi için admin ile iletişime geçin}'}</p>
                        <label className="inline-block bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition">
                            {uploading ? 'Yükleniyor...' : '📎 Dekont Yükle'}
                            <input type="file" accept="image/*" className="hidden" disabled={uploading}
                                onChange={e => e.target.files[0] && onUploadReceipt(e.target.files[0])} />
                        </label>
                    </div>
                )}
                {pendingRequest?.receiptUrl && (
                    <div className="bg-yellow-600/10 border border-yellow-500/40 rounded-xl p-4 mb-4">
                        <p className="text-yellow-400 font-bold text-sm">⏳ Dekont yüklendi, admin onayı bekleniyor.</p>
                    </div>
                )}

                {!sub && (
                    <div className="grid sm:grid-cols-2 gap-3">
                        {PACKAGES.map(pkg => (
                            <div key={pkg.key} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                                <p className="text-2xl mb-1">{pkg.icon}</p>
                                <p className="text-white font-bold text-sm mb-1">{pkg.name}</p>
                                <p className="text-purple-300 font-black text-lg mb-2">{pkg.price}₺<span className="text-xs text-gray-500">/ay</span></p>
                                <ul className="space-y-1 mb-3">
                                    {pkg.features.map((f, i) => <li key={i} className="text-gray-400 text-xs">• {f}</li>)}
                                </ul>
                                <button onClick={() => onPurchase(pkg.key)} disabled={submitting || !!pendingRequest}
                                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-bold py-2 rounded-lg disabled:opacity-40 hover:opacity-90 transition">
                                    {submitting ? '...' : 'Satın Al'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Tesis ekleme modalı ──
function VenueAddModal({ open, onClose, onCreated }) {
    const [form, setForm] = useState({ name: '', branch: '', city: '', district: '', address: '', phone: '', openTime: '08:00', closeTime: '23:00', slotType: 'FULL_HOUR', pricePerSlot: '' });
    const [courts, setCourts] = useState([{ name: 'Kort 1' }]);
    const [submitting, setSubmitting] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const submit = async () => {
        if (!form.name.trim() || !form.branch || !form.city.trim()) return alert('İsim, spor dalı ve şehir zorunludur');
        if (courts.every(c => !c.name.trim())) return alert('En az bir kort/saha girmelisiniz');
        setSubmitting(true);
        try {
            await api.post('/venues', {
                ...form,
                pricePerSlot: parseInt(form.pricePerSlot) || 0,
                courts: courts.filter(c => c.name.trim()),
            });
            onCreated();
            onClose();
        } catch (e) {
            alert(e?.response?.data?.message || 'Tesis eklenemedi');
        } finally { setSubmitting(false); }
    };

    if (!open) return null;
    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-black text-lg">+ Tesis / Kort Ekle</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>
                <div className="space-y-2.5">
                    <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Tesis adı *"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                    <select value={form.branch} onChange={e => set('branch', e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
                        <option value="">Spor dalı seç *</option>
                        {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                        <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Şehir *"
                            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                        <input value={form.district} onChange={e => set('district', e.target.value)} placeholder="İlçe"
                            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                    </div>
                    <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Adres"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                    <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Telefon"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-gray-500 text-[10px] font-bold">Açılış</label>
                            <input type="time" value={form.openTime} onChange={e => set('openTime', e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                        </div>
                        <div>
                            <label className="text-gray-500 text-[10px] font-bold">Kapanış</label>
                            <input type="time" value={form.closeTime} onChange={e => set('closeTime', e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                        </div>
                    </div>
                    <input value={form.pricePerSlot} onChange={e => set('pricePerSlot', e.target.value.replace(/\D/g, ''))} placeholder="Slot başı fiyat (₺)"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />

                    <p className="text-gray-400 text-xs font-bold pt-2">Kortlar</p>
                    {courts.map((c, i) => (
                        <div key={i} className="flex gap-2">
                            <input value={c.name} onChange={e => setCourts(prev => prev.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
                                placeholder={`Kort ${i + 1} adı`}
                                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                            {courts.length > 1 && (
                                <button onClick={() => setCourts(prev => prev.filter((_, xi) => xi !== i))} className="text-red-400 px-2">✕</button>
                            )}
                        </div>
                    ))}
                    <button onClick={() => setCourts(prev => [...prev, { name: `Kort ${prev.length + 1}` }])}
                        className="text-purple-400 text-xs font-bold">+ Kort Ekle</button>

                    <button onClick={submit} disabled={submitting}
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50 hover:opacity-90 transition mt-2">
                        {submitting ? '...' : 'Tesisi Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Rezervasyonlar sekmesi ──
function ReservationsTab({ venueId }) {
    const [reservations, setReservations] = useState([]);
    const [cancelRequests, setCancelRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('today');

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            api.get(`/venues/${venueId}/reservations`),
            api.get('/venues/reservations/cancel-requests'),
        ]).then(([resR, crR]) => {
            setReservations(resR.data || []);
            setCancelRequests((crR.data || []).filter(r => r.venueId === venueId));
        }).catch(() => {}).finally(() => setLoading(false));
    }, [venueId]);

    useEffect(() => { load(); }, [load]);

    const today = todayStr();
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const filtered = reservations.filter(r => {
        if (filter === 'today') return r.date === today;
        if (filter === 'week') return r.date >= today && r.date <= weekEndStr;
        return true;
    });

    const confirmPayment = async (id) => {
        try {
            await api.patch(`/venues/reservations/${id}/status`, { action: 'payment_confirm' });
            load();
        } catch (e) { alert(e?.response?.data?.message || 'İşlem başarısız'); }
    };
    const approveCancelReq = async (id) => {
        if (!confirm('İptal talebini onaylıyor musunuz?')) return;
        try {
            await api.post(`/venues/reservations/${id}/cancel-approve`);
            load();
        } catch (e) { alert(e?.response?.data?.message || 'İşlem başarısız'); }
    };

    if (loading) return <p className="text-gray-500 text-sm text-center py-8">Yükleniyor...</p>;
    return (
        <div className="space-y-3">
            {cancelRequests.length > 0 && (
                <div className="bg-yellow-600/10 border border-yellow-500/40 rounded-xl p-3 space-y-2">
                    <p className="text-yellow-400 font-bold text-xs">⚠️ Bekleyen İptal Talepleri ({cancelRequests.length})</p>
                    {cancelRequests.map(r => (
                        <div key={r.id} className="flex items-center justify-between bg-gray-900/60 rounded-lg p-2">
                            <div className="text-xs text-gray-300">
                                <p className="font-bold">{r.user?.fullName || r.user?.username}</p>
                                <p className="text-gray-500">{r.date} · {r.startTime}–{r.endTime} · {r.court?.name}</p>
                            </div>
                            <button onClick={() => approveCancelReq(r.id)} className="text-red-400 text-[11px] font-bold border border-red-500/40 rounded px-2 py-1">Onayla</button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex gap-2">
                {[['today', 'Bugün'], ['week', '7 Gün'], ['all', 'Tümü']].map(([k, l]) => (
                    <button key={k} onClick={() => setFilter(k)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${filter === k ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                        {l}
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-8">Rezervasyon yok.</p>
            ) : (
                <div className="space-y-2">
                    {filtered.map(r => (
                        <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-white text-sm font-bold truncate">{r.user?.fullName || r.user?.username}</p>
                                <p className="text-gray-500 text-xs">{r.date} · {r.startTime}–{r.endTime} · {r.court?.name}</p>
                                <p className="text-gray-500 text-xs">{r.status} {r.paymentMethod ? `· ${PAY_LABEL[r.paymentMethod] || r.paymentMethod}` : ''}</p>
                            </div>
                            {r.status === 'PENDING' && r.paymentMethod === 'CASH' && (
                                <button onClick={() => confirmPayment(r.id)} className="text-green-400 text-[11px] font-bold border border-green-500/40 rounded-lg px-2.5 py-1.5 flex-shrink-0">
                                    ✓ Ödeme Alındı
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Ayarlar sekmesi ──
function SettingsTab({ venue, onSaved }) {
    const [slotType, setSlotType] = useState(venue.slotType || 'FULL_HOUR');
    const [pricePerSlot, setPricePerSlot] = useState(String(venue.pricePerSlot || ''));
    const [acceptedPayments, setAcceptedPayments] = useState(venue.acceptedPayments?.length ? venue.acceptedPayments : ['CASH']);
    const [approvalMode, setApprovalMode] = useState(venue.approvalMode || 'FULL_AUTO');
    const [cancelHoursBefore, setCancelHoursBefore] = useState(venue.cancelHoursBefore ?? '');
    const [rescheduleHoursBefore, setRescheduleHoursBefore] = useState(venue.rescheduleHoursBefore ?? '');
    const [saving, setSaving] = useState(false);

    const togglePay = (m) => setAcceptedPayments(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

    const save = async () => {
        setSaving(true);
        try {
            await api.patch(`/venues/${venue.id}/settings`, {
                slotType, pricePerSlot: parseInt(pricePerSlot) || 0, acceptedPayments, approvalMode,
                cancelHoursBefore: cancelHoursBefore === '' ? null : parseInt(cancelHoursBefore),
                rescheduleHoursBefore: rescheduleHoursBefore === '' ? null : parseInt(rescheduleHoursBefore),
            });
            onSaved();
        } catch (e) { alert(e?.response?.data?.message || 'Kaydedilemedi'); }
        finally { setSaving(false); }
    };

    return (
        <div className="space-y-3">
            <div>
                <label className="text-gray-400 text-xs font-bold mb-1 block">Slot Tipi</label>
                <select value={slotType} onChange={e => setSlotType(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="FULL_HOUR">Tam Saat</option>
                    <option value="HALF_HOUR">Yarım Saat</option>
                    <option value="VAR_DURATION">Esnek Süre</option>
                </select>
            </div>
            <div>
                <label className="text-gray-400 text-xs font-bold mb-1 block">Slot Başı Fiyat (₺)</label>
                <input value={pricePerSlot} onChange={e => setPricePerSlot(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
                <label className="text-gray-400 text-xs font-bold mb-1 block">Kabul Edilen Ödeme Yöntemleri</label>
                <div className="flex gap-2 flex-wrap">
                    {Object.keys(PAY_LABEL).map(m => (
                        <button key={m} onClick={() => togglePay(m)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${acceptedPayments.includes(m) ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-900 border-gray-700 text-gray-500'}`}>
                            {PAY_LABEL[m]}
                        </button>
                    ))}
                </div>
            </div>
            <div>
                <label className="text-gray-400 text-xs font-bold mb-1 block">Rezervasyon Onay Modu</label>
                <select value={approvalMode} onChange={e => setApprovalMode(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                    {Object.entries(APPROVAL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-gray-400 text-xs font-bold mb-1 block">İptal İçin Min. Saat</label>
                    <input value={cancelHoursBefore} onChange={e => setCancelHoursBefore(e.target.value.replace(/\D/g, ''))} placeholder="Sınırsız"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <div>
                    <label className="text-gray-400 text-xs font-bold mb-1 block">Değiştirme İçin Min. Saat</label>
                    <input value={rescheduleHoursBefore} onChange={e => setRescheduleHoursBefore(e.target.value.replace(/\D/g, ''))} placeholder="Sınırsız"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
            </div>
            <button onClick={save} disabled={saving}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50 hover:opacity-90 transition">
                {saving ? '...' : 'Ayarları Kaydet'}
            </button>
        </div>
    );
}

// ── Tesis kartı ──
function VenueCard({ venue, onRefresh, onDelete }) {
    const [tab, setTab] = useState('info');
    const [deleting, setDeleting] = useState(false);
    const statusColor = venue.status === 'APPROVED' ? '#22c55e' : venue.status === 'PENDING' ? '#eab308' : '#ef4444';
    const statusLabel = venue.status === 'APPROVED' ? 'Onaylı' : venue.status === 'PENDING' ? 'Onay Bekliyor' : 'Reddedildi';

    const del = async () => {
        if (!confirm(`${venue.name} tesisini silmek istediğinize emin misiniz?`)) return;
        setDeleting(true);
        try { await api.delete(`/venues/${venue.id}`); onDelete(venue.id); }
        catch (e) { alert(e?.response?.data?.message || 'Silinemedi'); }
        finally { setDeleting(false); }
    };

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-3">
            <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                    <p className="text-white font-black">{venue.name}</p>
                    <p className="text-gray-500 text-xs">{venue.branch} · {venue.city}{venue.district ? ` / ${venue.district}` : ''}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0" style={{ color: statusColor, borderColor: statusColor + '60', backgroundColor: statusColor + '15' }}>
                    {statusLabel}
                </span>
            </div>

            <div className="flex gap-1.5 mb-3 overflow-x-auto">
                {[['info', 'ℹ️ Bilgi'], ['reservations', '📅 Rezervasyonlar'], ['settings', '⚙️ Ayarlar']].map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition ${tab === k ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                        {l}
                    </button>
                ))}
            </div>

            {tab === 'info' && (
                <div className="space-y-2 text-sm">
                    <p className="text-gray-400">📍 {venue.address || '—'}</p>
                    <p className="text-gray-400">📞 {venue.phone || '—'}</p>
                    <p className="text-gray-400">⏰ {venue.openTime}–{venue.closeTime}</p>
                    <p className="text-gray-400">🏟️ {(venue.courts || []).map(c => c.name).join(', ') || '—'}</p>
                    <button onClick={del} disabled={deleting} className="text-red-400 text-xs font-bold border border-red-500/40 rounded-lg px-3 py-1.5 mt-2 disabled:opacity-50">
                        {deleting ? '...' : '🗑 Tesisi Sil'}
                    </button>
                </div>
            )}
            {tab === 'reservations' && <ReservationsTab venueId={venue.id} />}
            {tab === 'settings' && <SettingsTab venue={venue} onSaved={onRefresh} />}
        </div>
    );
}

function BusinessHomePage() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const user = useSelector(s => s.auth.user);

    const [sub, setSub] = useState(null);
    const [pendingRequest, setPendingRequest] = useState(null);
    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [subModalOpen, setSubModalOpen] = useState(false);
    const [venueModalOpen, setVenueModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const fetchAll = useCallback(() => {
        setLoading(true);
        Promise.all([api.get('/subscriptions/me'), api.get('/venues/mine')])
            .then(([subRes, venueRes]) => {
                setSub(subRes.data.subscription);
                setPendingRequest(subRes.data.pendingRequest);
                setVenues(venueRes.data);
            }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    useEffect(() => { if (user?.isBusiness) fetchAll(); else setLoading(false); }, [fetchAll, user]);

    const handlePurchase = async (packageType) => {
        setSubmitting(true);
        try {
            const { data } = await api.post('/subscriptions/request', { packageType });
            setPendingRequest(data.request);
        } catch (e) { alert(e?.response?.data?.message || 'Gönderilemedi'); }
        finally { setSubmitting(false); }
    };

    const handleUploadReceipt = async (file) => {
        setUploading(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const { data: upload } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            const { data } = await api.patch('/subscriptions/request/receipt', { receiptUrl: upload.url });
            setPendingRequest(data.request);
        } catch (e) { alert(e?.response?.data?.message || 'Yüklenemedi'); }
        finally { setUploading(false); }
    };

    const handleCancelSub = async () => {
        if (!confirm('Aboneliğinizi iptal etmek istediğinize emin misiniz?')) return;
        setCancelling(true);
        try { await api.delete('/subscriptions/cancel'); setSub(null); }
        catch (e) { alert(e?.response?.data?.message || 'İptal edilemedi'); }
        finally { setCancelling(false); }
    };

    if (!user?.isBusiness) {
        return (
            <div className="min-h-screen bg-gray-950">
                <Navbar onBack={() => navigate(-1)} title="İşletme Paneli" />
                <div className="max-w-lg mx-auto px-4 py-16 text-center">
                    <p className="text-5xl mb-4">🏢</p>
                    <p className="text-white font-bold text-lg mb-2">Bu alan işletme hesapları içindir</p>
                    <p className="text-gray-400 text-sm">İşletme hesabı oluşturmak için mobil uygulamadan "İşletme Olarak Kayıt Ol" seçeneğini kullanabilirsiniz.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} title="İşletme Paneli" />

            <div className="max-w-3xl mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-black text-amber-400">🏢 İşletme Hesabı</h1>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setSubModalOpen(true)} className="text-xs font-bold border border-amber-500/40 bg-amber-500/10 text-amber-400 rounded-full px-3 py-1.5">
                            📋 Abonelikler
                        </button>
                        <button onClick={() => dispatch(logout())} className="text-xs font-bold border border-gray-700 text-gray-400 rounded-full px-3 py-1.5">
                            Çıkış
                        </button>
                    </div>
                </div>

                {loading ? (
                    <p className="text-gray-500 text-sm text-center py-16">Yükleniyor...</p>
                ) : (
                    <>
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4 flex items-center justify-between">
                            <p className="text-sm text-gray-300">
                                {sub ? `✅ ${PACKAGES.find(p => p.key === sub.packageType)?.name || sub.packageType} aktif.`
                                    : pendingRequest ? '⏳ Abonelik onayı bekleniyor.'
                                    : '⚠️ Aktif abonelik yok — tesis eklemek için abonelik gereklidir.'}
                            </p>
                            {!sub && !pendingRequest && (
                                <button onClick={() => setSubModalOpen(true)} className="bg-amber-500 text-black text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0">
                                    Paketi Satın Al
                                </button>
                            )}
                        </div>

                        <div className="flex items-center justify-between mb-3">
                            <p className="text-white font-bold">🏟️ Tesislerim</p>
                            {sub && (
                                <button onClick={() => setVenueModalOpen(true)} className="bg-amber-500 text-black text-xs font-bold px-3 py-1.5 rounded-lg">
                                    + Tesis Ekle
                                </button>
                            )}
                        </div>

                        {venues.length === 0 ? (
                            <div className="text-center py-12 bg-gray-900 border border-gray-800 rounded-2xl">
                                <p className="text-4xl mb-2">🏟️</p>
                                <p className="text-gray-400 text-sm">{sub ? 'Henüz tesis eklenmedi.' : 'Tesis eklemek için önce abonelik alın.'}</p>
                            </div>
                        ) : (
                            venues.map(v => (
                                <VenueCard key={v.id} venue={v} onRefresh={fetchAll} onDelete={id => setVenues(prev => prev.filter(x => x.id !== id))} />
                            ))
                        )}
                    </>
                )}
            </div>

            <SubscriptionModal
                open={subModalOpen} onClose={() => setSubModalOpen(false)}
                sub={sub} pendingRequest={pendingRequest}
                onPurchase={handlePurchase} onUploadReceipt={handleUploadReceipt} onCancel={handleCancelSub}
                submitting={submitting} uploading={uploading} cancelling={cancelling}
            />
            <VenueAddModal open={venueModalOpen} onClose={() => setVenueModalOpen(false)} onCreated={fetchAll} />
        </div>
    );
}

export default BusinessHomePage;
