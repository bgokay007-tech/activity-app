import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import CityAutocomplete from './CityAutocomplete';

// Sekmelerdeki 🔔 sadece profildeki ili aç/kapa yapıyordu — başka ilin ilanlarını takip
// etmek mümkün değildi. Backend zaten birden çok ili destekliyor (city + subscribedCities).
export default function CityAlertControl({ sub, tab, config, align = 'left' }) {
    const { t } = useTranslation();
    const [cities, setCities] = useState([]);
    const [profileCity, setProfileCity] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        api.get(`/city-alerts/${sub}`, { params: { tab } })
            .then(({ data }) => {
                if (!alive) return;
                setCities(Array.isArray(data?.subscribedCities) ? data.subscribedCities : []);
                setProfileCity(data?.city || null);
            })
            .catch(() => {})
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [sub, tab]);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const toggle = async (city) => {
        if (!city || busy) return;
        setBusy(true);
        try {
            const { data } = await api.post('/city-alerts', { subCategory: sub, tab, city });
            setCities(Array.isArray(data?.subscribedCities) ? data.subscribedCities : []);
            setInput('');
        } catch (e) {
            alert(e?.response?.data?.message || t('common.action_failed'));
        } finally { setBusy(false); }
    };

    const addCity = (raw) => {
        const city = String(raw || '').trim();
        if (!city || cities.some(c => c.toLocaleLowerCase('tr') === city.toLocaleLowerCase('tr'))) { setInput(''); return; }
        toggle(city);
    };

    const on = cities.length > 0;
    const label = cities.length === 1 ? cities[0] : cities.length > 1 ? `${cities[0]} +${cities.length - 1}` : '';

    return (
        <div className="relative flex-shrink-0" ref={ref}>
            <button
                type="button"
                title={t('cityAlert.desc')}
                onClick={() => setOpen(v => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold transition ${on ? `bg-gradient-to-r ${config?.color || 'from-lime-500 to-lime-400'} border-transparent text-white` : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}
            >
                {loading ? '...' : on ? '🔔' : '🔕'} {label}
                <span className="text-[9px] opacity-70">▾</span>
            </button>
            {open && (
                <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1.5 w-72 z-40 bg-[#16181F] border border-[#2A2D36] rounded-2xl shadow-2xl p-3`}>
                    <p className="text-[#F4F1EA] text-sm font-bold">🔔 {t('cityAlert.title')}</p>
                    <p className="text-[#78716C] text-[11px] mt-0.5 mb-2.5">{t('cityAlert.desc')}</p>

                    {cities.length === 0 ? (
                        <p className="text-[#A8A29A] text-xs mb-2.5">{t('cityAlert.none')}</p>
                    ) : (
                        <div className="flex flex-wrap gap-1.5 mb-2.5">
                            {cities.map(c => (
                                <span key={c} className="flex items-center gap-1 bg-[#C8F54A]/15 text-[#C8F54A] text-xs font-bold pl-2.5 pr-1.5 py-1 rounded-full">
                                    {c}
                                    <button type="button" disabled={busy} onClick={() => toggle(c)} title={t('cityAlert.remove')} className="text-[#C8F54A]/70 hover:text-red-300 px-0.5">✕</button>
                                </span>
                            ))}
                        </div>
                    )}

                    {profileCity && !cities.includes(profileCity) && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggle(profileCity)}
                            className="w-full text-left bg-[#1C1F28] hover:bg-[#23262F] border border-[#2A2D36] text-[#F4F1EA] text-xs font-bold px-3 py-2 rounded-xl mb-2 transition"
                        >
                            + {t('cityAlert.add_profile_city', { city: profileCity })}
                        </button>
                    )}

                    <CityAutocomplete
                        value={input}
                        onChange={setInput}
                        onSelect={(c) => addCity(c?.province)}
                        placeholder={t('cityAlert.add_city_ph')}
                        className="w-full bg-[#1C1F28] text-white text-xs rounded-xl px-3 py-2 border border-[#2A2D36] focus:outline-none focus:border-[#C8F54A]"
                    />
                </div>
            )}
        </div>
    );
}
