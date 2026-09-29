import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import Navbar from '../../components/Navbar';
import { INPUT, LABEL, PRIMARY_BTN, Stepper, formatTripDate } from './travelShared';

const CARD = 'bg-gray-900 border border-gray-800 rounded-2xl p-4 mt-3 space-y-1';
const MSG_BTN = 'border border-sky-500 text-sky-400 rounded-xl px-3 py-1.5 text-sm font-bold hover:bg-sky-500/10 shrink-0';

export default function TravelTripDetailPage() {
    const { t } = useTranslation();
    const tv = (k, o) => t(`travel.${k}`, o);
    const navigate = useNavigate();
    const { tripId } = useParams();
    const [trip, setTrip] = useState(null);
    const [loading, setLoading] = useState(true);
    const [seats, setSeats] = useState(1);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get(`/travel/trips/${tripId}`);
            setTrip(data);
        } catch { setTrip(null); }
        finally { setLoading(false); }
    }, [tripId]);

    useEffect(() => { load(); }, [load]);

    const isOwner = trip && Array.isArray(trip.requests);

    const run = async (fn, okMsg) => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
            if (okMsg) alert(okMsg);
            await load();
        } catch (e) {
            alert(e?.response?.data?.message || tv('actionFailed'));
        } finally { setBusy(false); }
    };

    const requestJoin = () => run(() => api.post(`/travel/trips/${tripId}/requests`, { seats, message }), tv('tvRequestSent'));
    const cancelRequest = () => run(() => api.delete(`/travel/trips/${tripId}/requests/mine`));
    const respond = (requestId, action) => run(() => api.patch(`/travel/trips/requests/${requestId}`, { action }));
    const cancelTrip = () => { if (window.confirm(tv('tvCancelTripQ'))) run(() => api.patch(`/travel/trips/${tripId}/cancel`)); };
    const openChat = (user) => { if (user?.id) navigate(`/messages/${user.id}`); };

    const cancelled = trip?.status === 'CANCELLED';
    const myReq = trip?.myRequest;
    const canRequest = trip && !isOwner && !cancelled && (!myReq || myReq.status === 'REJECTED' || myReq.status === 'CANCELLED') && trip.seatsLeft > 0;
    const activeRequests = isOwner ? trip.requests.filter(r => r.status !== 'CANCELLED') : [];

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} title={tv('tvTabTravel')} />
            {loading ? <p className="text-gray-500 text-center py-16">…</p> : !trip ? (
                <p className="text-gray-500 text-center py-16">{tv('actionFailed')}</p>
            ) : (
                <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
                    <div className={CARD}>
                        <p className="text-white text-xl font-black">{trip.fromPlace} → {trip.toPlace}</p>
                        {trip.waypoints?.length > 0 && <p className="text-gray-400 text-sm">↳ {trip.waypoints.join(' → ')}</p>}
                        <p className="text-gray-400 text-sm">🕒 {tv('tvDeparture')}: {formatTripDate(trip.departAt)}</p>
                        <p className="text-gray-400 text-sm">💺 {tv('tvSeatsLeft', { n: trip.seatsLeft })} / {trip.seats}</p>
                        <p className="text-green-500 font-black">{trip.pricePerSeat > 0 ? tv('tvPerSeat', { p: trip.pricePerSeat }) : tv('tvFree')}</p>
                        {trip.vehicle && <p className="text-gray-400 text-sm">🚘 {trip.vehicle}</p>}
                        {trip.note && <p className="text-gray-400 text-sm italic mt-1.5">{trip.note}</p>}
                        {cancelled && <p className="text-red-400 font-black mt-1.5">{tv('tvTripCancelled')}</p>}
                    </div>

                    <div className={`${CARD} flex items-center gap-3`}>
                        <div className="flex-1">
                            <p className="text-white font-bold">👤 {trip.user?.fullName || trip.user?.username}</p>
                            {trip.user?.travelVerified && <p className="text-green-500 text-xs font-bold">{tv('tvVerifiedBadge')}</p>}
                        </div>
                        {!isOwner && <button className={MSG_BTN} onClick={() => openChat(trip.user)}>{tv('tvMessage')}</button>}
                    </div>

                    {!isOwner && myReq && myReq.status !== 'CANCELLED' && (
                        <div className={CARD}>
                            <p className="text-sky-400 font-bold text-sm">{tv(`tvReqStatus${myReq.status}`)}</p>
                            {(myReq.status === 'PENDING' || myReq.status === 'ACCEPTED') && !cancelled && (
                                <button onClick={cancelRequest} disabled={busy} className="text-red-400 font-bold text-sm">{tv('tvCancelRequest')}</button>
                            )}
                        </div>
                    )}

                    {canRequest && (
                        <div className={CARD}>
                            <p className={LABEL}>{tv('tvSeatsWanted')}</p>
                            <Stepper value={seats} onChange={setSeats} min={1} max={trip.seatsLeft} />
                            <textarea className={`${INPUT} min-h-20 mt-3`} value={message} onChange={e => setMessage(e.target.value)} placeholder={tv('tvRequestMsgPh')} />
                            <button className={`${PRIMARY_BTN} mt-3`} onClick={requestJoin} disabled={busy}>{busy ? '…' : tv('tvRequestJoin')}</button>
                        </div>
                    )}

                    {isOwner && (
                        <>
                            <p className="text-white font-black mt-6">{tv('tvRequests')}</p>
                            {activeRequests.length === 0 && <p className="text-gray-500 text-sm mt-1">{tv('tvNoRequests')}</p>}
                            {activeRequests.map(r => (
                                <div key={r.id} className={CARD}>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1">
                                            <p className="text-white font-bold">{r.user?.fullName || r.user?.username} · {r.seats} 💺</p>
                                            {r.user?.travelVerified && <p className="text-green-500 text-xs font-bold">{tv('tvVerifiedBadge')}</p>}
                                        </div>
                                        <button className={MSG_BTN} onClick={() => openChat(r.user)}>{tv('tvMessage')}</button>
                                    </div>
                                    {r.message && <p className="text-gray-400 text-sm italic mt-1.5">{r.message}</p>}
                                    {r.status === 'PENDING' && !cancelled ? (
                                        <div className="flex gap-2.5 mt-2.5">
                                            <button onClick={() => respond(r.id, 'ACCEPT')} disabled={busy} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl py-2.5">{tv('tvAccept')}</button>
                                            <button onClick={() => respond(r.id, 'REJECT')} disabled={busy} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl py-2.5">{tv('tvReject')}</button>
                                        </div>
                                    ) : (
                                        <p className="text-sky-400 font-bold text-sm mt-1.5">{tv(`tvReqStatus${r.status}`)}</p>
                                    )}
                                </div>
                            ))}
                            {!cancelled && (
                                <button onClick={cancelTrip} disabled={busy} className="w-full text-red-400 font-bold mt-6">{tv('tvCancelTrip')}</button>
                            )}
                        </>
                    )}

                    <p className="text-gray-500 text-xs mt-6">🛡️ {tv('tvSafetyNote')}</p>
                </div>
            )}
        </div>
    );
}
