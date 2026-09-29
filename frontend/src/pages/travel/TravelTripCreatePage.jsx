import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import Navbar from '../../components/Navbar';
import CityAutocomplete from '../../components/CityAutocomplete';
import { INPUT, LABEL, PRIMARY_BTN, chip, Stepper } from './travelShared';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];
const pad2 = (n) => String(n).padStart(2, '0');

export default function TravelTripCreatePage() {
    const { t } = useTranslation();
    const tv = (k, o) => t(`travel.${k}`, o);
    const navigate = useNavigate();
    const days = useMemo(() => Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + i);
        return d;
    }), []);

    const [fromPlace, setFromPlace] = useState('');
    const [toPlace, setToPlace] = useState('');
    const [waypoints, setWaypoints] = useState([]);
    const [dayIdx, setDayIdx] = useState(0);
    const [hour, setHour] = useState(Math.min(23, new Date().getHours() + 1));
    const [minute, setMinute] = useState(0);
    const [seats, setSeats] = useState(1);
    const [paid, setPaid] = useState(false);
    const [price, setPrice] = useState('');
    const [vehicle, setVehicle] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const dayLabel = (d, i) => (i === 0 ? tv('tvToday') : i === 1 ? tv('tvTomorrow') : `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`);

    const submit = async (e) => {
        e.preventDefault();
        if (!fromPlace.trim() || !toPlace.trim()) { alert(tv('tvRequiredTrip')); return; }
        const dt = new Date(days[dayIdx]);
        dt.setHours(hour, minute, 0, 0);
        setSaving(true);
        try {
            const { data } = await api.post('/travel/trips', {
                fromPlace, toPlace, waypoints: waypoints.filter(x => x.trim()),
                departAt: dt.toISOString(), seats,
                pricePerSeat: paid ? parseInt(price, 10) || 0 : 0,
                vehicle, note,
            });
            alert(tv('tvTripCreated'));
            navigate(`/travel/trips/${data.id}`, { replace: true });
        } catch (err) {
            if (err?.response?.data?.code === 'VERIFICATION_REQUIRED') {
                navigate('/travel/verify', { replace: true });
                return;
            }
            alert(err?.response?.data?.message || tv('actionFailed'));
        } finally { setSaving(false); }
    };

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} title={tv('tvTitle')} />
            <form onSubmit={submit} className="max-w-2xl mx-auto px-4 py-6 pb-24">
                <h2 className="text-white text-xl font-black text-center">{tv('tvCreateTrip').replace('+ ', '')}</h2>

                <label className={LABEL}>{tv('tvFrom')} *</label>
                <CityAutocomplete value={fromPlace} onChange={setFromPlace} placeholder={tv('tvPlacePh')} className={INPUT} />
                <label className={LABEL}>{tv('tvTo')} *</label>
                <CityAutocomplete value={toPlace} onChange={setToPlace} placeholder={tv('tvPlacePh')} className={INPUT} />

                <label className={LABEL}>{tv('tvWaypoints')}</label>
                {waypoints.map((w, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2">
                        <input className={INPUT} value={w} placeholder={tv('tvPlacePh')}
                            onChange={e => setWaypoints(prev => prev.map((x, j) => (j === i ? e.target.value : x)))} />
                        <button type="button" onClick={() => setWaypoints(prev => prev.filter((_, j) => j !== i))}
                            className="w-9 h-9 shrink-0 rounded-full bg-gray-800 text-white font-black">✕</button>
                    </div>
                ))}
                <button type="button" onClick={() => setWaypoints(prev => [...prev, ''])} className="text-sky-400 font-bold text-sm py-1">{tv('tvAddWaypoint')}</button>

                <label className={LABEL}>{tv('tvDepartDate')}</label>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {days.map((d, i) => (
                        <button type="button" key={i} className={`${chip(dayIdx === i)} shrink-0`} onClick={() => setDayIdx(i)}>{dayLabel(d, i)}</button>
                    ))}
                </div>

                <label className={LABEL}>{tv('tvDepartTime')}: {pad2(hour)}:{pad2(minute)}</label>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {HOURS.map(h => (
                        <button type="button" key={h} className={`${chip(hour === h)} shrink-0`} onClick={() => setHour(h)}>{pad2(h)}</button>
                    ))}
                </div>
                <div className="flex gap-1.5 mt-2">
                    {MINUTES.map(m => (
                        <button type="button" key={m} className={chip(minute === m)} onClick={() => setMinute(m)}>:{pad2(m)}</button>
                    ))}
                </div>

                <label className={LABEL}>{tv('tvSeats')}</label>
                <Stepper value={seats} onChange={setSeats} min={1} max={8} />

                <label className={LABEL}>{tv('tvPrice')}</label>
                <div className="flex gap-2">
                    <button type="button" className={chip(!paid)} onClick={() => setPaid(false)}>{tv('tvPriceFree')}</button>
                    <button type="button" className={chip(paid)} onClick={() => setPaid(true)}>{tv('tvPricePaid')}</button>
                </div>
                {paid && (
                    <input className={`${INPUT} mt-2`} value={price} onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={tv('tvPricePh')} />
                )}

                <label className={LABEL}>{tv('tvVehicle')}</label>
                <input className={INPUT} value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder={tv('tvVehiclePh')} />

                <label className={LABEL}>{tv('tvNote')}</label>
                <textarea className={`${INPUT} min-h-20`} value={note} onChange={e => setNote(e.target.value)} placeholder={tv('tvNotePh')} />

                <p className="text-gray-500 text-xs mt-4">🛡️ {tv('tvSafetyNote')}</p>

                <button type="submit" className={`${PRIMARY_BTN} mt-4`} disabled={saving}>{saving ? '…' : tv('tvPublishTrip')}</button>
            </form>
        </div>
    );
}
