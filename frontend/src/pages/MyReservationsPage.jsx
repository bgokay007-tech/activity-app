import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Navbar from '../components/Navbar';

const STATUS_COLOR = { PENDING: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', CONFIRMED: 'text-green-400 bg-green-500/10 border-green-500/30', CANCELLED: 'text-gray-400 bg-gray-500/10 border-gray-500/30' };

function pad(n) { return String(n).padStart(2, '0'); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function RescheduleModal({ reservation, onClose, onRescheduled, t }) {
    const [venue, setVenue] = useState(null);
    const [loadingVenue, setLoadingVenue] = useState(true);
    const [courtId, setCourtId] = useState(reservation.courtId);
    const [date, setDate] = useState(todayStr());
    const [slotData, setSlotData] = useState(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [confirming, setConfirming] = useState(false);

    useEffect(() => {
        api.get(`/venues/${reservation.venueId}`)
            .then(({ data }) => setVenue(data))
            .catch(() => setVenue(null))
            .finally(() => setLoadingVenue(false));
    }, [reservation.venueId]);

    const loadSlots = useCallback(() => {
        if (!courtId) return;
        setLoadingSlots(true);
        setSelectedSlot(null);
        api.get(`/venues/${reservation.venueId}/courts/${courtId}/slots`, { params: { date, excludeReservationId: reservation.id } })
            .then(({ data }) => setSlotData(data))
            .catch(() => setSlotData({ error: true }))
            .finally(() => setLoadingSlots(false));
    }, [reservation.venueId, reservation.id, courtId, date]);

    useEffect(() => { loadSlots(); }, [loadSlots]);

    const confirmReschedule = async () => {
        if (!selectedSlot) return;
        setConfirming(true);
        try {
            await api.patch(`/venues/reservations/${reservation.id}/reschedule`, {
                newDate: date, newStartTime: selectedSlot.start, newEndTime: selectedSlot.end,
            });
            onRescheduled(date, selectedSlot.start, selectedSlot.end);
        } catch (e) {
            alert(e?.response?.data?.message || t('reservations.reschedule_failed'));
        } finally { setConfirming(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                    <h3 className="text-white font-black text-lg">{t('reservations.reschedule_title')}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                <div className="p-5 space-y-3">
                    {loadingVenue ? (
                        <p className="text-gray-500 text-sm text-center py-8">{t('common.loading')}</p>
                    ) : !venue ? (
                        <p className="text-red-400 text-sm text-center py-8">{t('reservations.venue_load_failed')}</p>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-2">
                                <select value={courtId} onChange={e => setCourtId(e.target.value)}
                                    className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
                                    {(venue.courts || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                                    className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                            </div>

                            {loadingSlots ? (
                                <p className="text-gray-500 text-sm text-center py-8">{t('common.loading')}</p>
                            ) : !slotData || slotData.error ? (
                                <p className="text-red-400 text-sm text-center py-8">{t('reservations.slots_load_failed')}</p>
                            ) : slotData.type === 'NOT_YET_OPEN' ? (
                                <p className="text-yellow-400 text-sm text-center py-8">⏳ {slotData.message}</p>
                            ) : slotData.type === 'MAINTENANCE' ? (
                                <p className="text-orange-400 text-sm text-center py-8">🔧 {slotData.message}</p>
                            ) : slotData.windows ? (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {slotData.windows.map((w, i) => (
                                        <button key={i} onClick={() => setSelectedSlot({ start: w.start, end: w.end })}
                                            className={`px-2 py-2 rounded-lg text-xs font-bold border transition ${selectedSlot?.start === w.start ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                                            {w.start}–{w.end}
                                        </button>
                                    ))}
                                    {slotData.windows.length === 0 && <p className="text-gray-600 text-sm col-span-full text-center py-6">{t('reservations.no_slots')}</p>}
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {(slotData.slots || []).map(s => {
                                        const disabled = !s.free || s.maintenance;
                                        const isSel = selectedSlot?.start === s.start;
                                        return (
                                            <button key={s.start} disabled={disabled} onClick={() => setSelectedSlot({ start: s.start, end: s.end })}
                                                className={`px-2 py-2 rounded-lg text-xs font-bold border transition ${
                                                    disabled ? 'bg-gray-900/50 border-gray-800 text-gray-600 cursor-not-allowed'
                                                    : isSel ? 'bg-purple-600 border-purple-500 text-white'
                                                    : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
                                                }`}>
                                                {s.start}–{s.end}
                                            </button>
                                        );
                                    })}
                                    {(slotData.slots || []).length === 0 && <p className="text-gray-600 text-sm col-span-full text-center py-6">{t('reservations.no_slots')}</p>}
                                </div>
                            )}

                            <button onClick={confirmReschedule} disabled={!selectedSlot || confirming}
                                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-40 hover:opacity-90 transition">
                                {confirming ? t('common.loading') : t('reservations.confirm_new_time')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function ReservationCard({ item, onCancel, onCancelRequested, onOpenReschedule, t }) {
    const [cancelling, setCancelling] = useState(false);
    const [requesting, setRequesting] = useState(false);

    const now = new Date();
    const today = todayStr();
    const isPast = item.date < today || (item.date === today && item.endTime && new Date(`${item.date}T${item.endTime}:00`) <= now);
    const hoursUntil = (new Date(`${item.date}T${item.startTime}:00`) - now) / 3600000;

    const cb = item.venue?.cancelHoursBefore ?? null;
    const rb = item.venue?.rescheduleHoursBefore ?? null;

    const canCancel = item.status !== 'CANCELLED' && !isPast && (cb === null || (cb >= 0 && hoursUntil >= cb));
    const cancelBlocked = item.status !== 'CANCELLED' && !isPast && cb !== null && (cb < 0 || hoursUntil < cb);
    const canReschedule = item.status !== 'CANCELLED' && !isPast && (rb === null || (rb >= 0 && hoursUntil >= rb));

    const handleCancel = async () => {
        if (!confirm(t('reservations.cancel_confirm'))) return;
        setCancelling(true);
        try {
            await api.delete(`/venues/reservations/${item.id}`);
            onCancel(item.id);
        } catch (e) {
            alert(e?.response?.data?.message || t('reservations.cancel_failed'));
        } finally { setCancelling(false); }
    };

    const handleCancelRequest = async (requestType) => {
        const msg = requestType === 'CANCEL' ? t('reservations.cancel_request_confirm') : t('reservations.reschedule_request_confirm');
        if (!confirm(msg)) return;
        setRequesting(true);
        try {
            await api.post(`/venues/reservations/${item.id}/cancel-request`, { requestType });
            onCancelRequested(item.id);
        } catch (e) {
            alert(e?.response?.data?.message || t('reservations.request_failed'));
        } finally { setRequesting(false); }
    };

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                    <p className="text-white font-black">{item.venue?.name}</p>
                    <p className="text-gray-400 text-sm">{item.court?.name}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border flex-shrink-0 ${STATUS_COLOR[item.status] || ''}`}>
                    {t(`reservations.status_${item.status?.toLowerCase()}`)}
                </span>
            </div>
            <div className="flex gap-4 mb-1">
                <span className="text-gray-300 text-sm font-bold">📅 {item.date}</span>
                <span className="text-gray-300 text-sm font-bold">⏰ {item.startTime} – {item.endTime}</span>
            </div>
            {item.venue?.city && <p className="text-gray-500 text-xs mb-1">📍 {item.venue.city}{item.venue.district ? ` / ${item.venue.district}` : ''}</p>}
            {item.venue?.pricePerSlot > 0 && <p className="text-gray-500 text-xs mb-2">💰 {item.venue.pricePerSlot} ₺ / slot</p>}
            {item.paymentMethod && <p className="text-gray-500 text-xs mb-2">{item.paymentMethod === 'CASH' ? t('reservations.pay_cash') : t('reservations.pay_online')}</p>}

            <div className="flex flex-wrap gap-2 mt-3">
                {canCancel && (
                    <button onClick={handleCancel} disabled={cancelling}
                        className="flex-1 min-w-[100px] border border-red-500/40 bg-red-500/10 text-red-400 font-bold text-xs py-2 rounded-lg hover:bg-red-500/20 transition disabled:opacity-50">
                        {cancelling ? '…' : t('reservations.cancel_btn')}
                    </button>
                )}
                {cancelBlocked && !item.cancelRequested && (
                    <>
                        <button onClick={() => handleCancelRequest('CANCEL')} disabled={requesting}
                            className="flex-1 min-w-[130px] border border-red-500/40 bg-red-500/10 text-red-400 font-bold text-xs py-2 rounded-lg hover:bg-red-500/20 transition disabled:opacity-50">
                            📋 {t('reservations.request_cancel_btn')}
                        </button>
                        <button onClick={() => handleCancelRequest('RESCHEDULE')} disabled={requesting}
                            className="flex-1 min-w-[130px] border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 font-bold text-xs py-2 rounded-lg hover:bg-yellow-500/20 transition disabled:opacity-50">
                            🔄 {t('reservations.request_reschedule_btn')}
                        </button>
                    </>
                )}
                {cancelBlocked && item.cancelRequested && (
                    <div className="flex-1 min-w-[130px] border border-yellow-500/30 text-yellow-400 font-bold text-xs py-2 rounded-lg text-center opacity-70">
                        {item.cancelRequestNote?.startsWith('RESCHEDULE') ? `✓ ${t('reservations.reschedule_requested')}` : `✓ ${t('reservations.cancel_requested')}`}
                    </div>
                )}
                {canReschedule && (
                    <button onClick={() => onOpenReschedule(item)}
                        className="flex-1 min-w-[100px] border border-blue-500/40 bg-blue-500/10 text-blue-400 font-bold text-xs py-2 rounded-lg hover:bg-blue-500/20 transition">
                        {t('reservations.reschedule_btn')}
                    </button>
                )}
            </div>
        </div>
    );
}

function MyReservationsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [reservations, setReservations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('upcoming');
    const [reschedulingRes, setReschedulingRes] = useState(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/venues/reservations/mine');
            setReservations(data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const now = new Date();
    const today = todayStr();
    const isPast = (r) => {
        if (r.date < today) return true;
        if (r.date === today && r.endTime) return new Date(`${r.date}T${r.endTime}:00`) <= now;
        return false;
    };

    const awaitCount = reservations.filter(r => r.status === 'PENDING' && r.paymentMethod === 'CASH' && new Date(`${r.date}T${r.startTime}:00`) <= now).length;

    const filtered = reservations.filter(r => {
        if (filter === 'upcoming') return !isPast(r) && r.status === 'CONFIRMED';
        if (filter === 'pending') return !isPast(r) && r.status === 'PENDING';
        if (filter === 'await') return r.status === 'PENDING' && r.paymentMethod === 'CASH' && new Date(`${r.date}T${r.startTime}:00`) <= now;
        if (filter === 'past') return isPast(r) || r.status === 'CANCELLED';
        return true;
    });

    const emptyText = filter === 'upcoming' ? t('reservations.empty_upcoming')
        : filter === 'pending' ? t('reservations.empty_pending')
        : filter === 'await' ? t('reservations.empty_await')
        : t('reservations.empty_all');

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} title={t('reservations.title')} />

            <div className="max-w-3xl mx-auto px-4 py-6">
                <h1 className="text-2xl font-black text-white mb-4">📅 {t('reservations.title')}</h1>

                <div className="flex flex-wrap gap-2 mb-5">
                    {[
                        { key: 'upcoming', label: t('reservations.filter_upcoming') },
                        { key: 'pending', label: t('reservations.filter_pending') },
                        { key: 'await', label: awaitCount > 0 ? `${t('reservations.filter_await')} (${awaitCount})` : t('reservations.filter_await') },
                        { key: 'past', label: t('reservations.filter_past') },
                        { key: 'all', label: t('reservations.filter_all') },
                    ].map(f => (
                        <button key={f.key} onClick={() => setFilter(f.key)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${filter === f.key ? (f.key === 'await' ? 'bg-yellow-600/30 border-yellow-500 text-yellow-300' : 'bg-purple-600 border-purple-500 text-white') : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                            {f.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <p className="text-gray-500 text-sm text-center py-16">{t('common.loading')}</p>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-4xl mb-3">📭</p>
                        <p className="text-gray-500 text-sm mb-4">{emptyText}</p>
                        {(filter === 'upcoming' || filter === 'pending') && (
                            <button onClick={() => navigate('/venues')}
                                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition">
                                {t('reservations.search_venue')}
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(item => (
                            <ReservationCard key={item.id} item={item} t={t}
                                onCancel={id => setReservations(prev => prev.map(r => r.id === id ? { ...r, status: 'CANCELLED' } : r))}
                                onCancelRequested={id => setReservations(prev => prev.map(r => r.id === id ? { ...r, cancelRequested: true } : r))}
                                onOpenReschedule={setReschedulingRes}
                            />
                        ))}
                    </div>
                )}
            </div>

            {reschedulingRes && (
                <RescheduleModal
                    reservation={reschedulingRes}
                    t={t}
                    onClose={() => setReschedulingRes(null)}
                    onRescheduled={(newDate, newStartTime, newEndTime) => {
                        setReservations(prev => prev.map(r => r.id === reschedulingRes.id ? { ...r, date: newDate, startTime: newStartTime, endTime: newEndTime } : r));
                        setReschedulingRes(null);
                    }}
                />
            )}
        </div>
    );
}

export default MyReservationsPage;
