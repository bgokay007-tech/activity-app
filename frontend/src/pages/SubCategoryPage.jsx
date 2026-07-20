import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../store/slices/authSlice';
import { connectSocket, onSocket } from '../services/socket';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Navbar from '../components/Navbar';
import ContentViewer from '../components/ContentViewer';
import CreatePostModal from '../components/CreatePostModal';
import PeerReviewModal from '../components/PeerReviewModal';
import { ENABLED_SUBS, MAINTENANCE_MESSAGE } from '../config/features';
import { shareRival, shareTournament } from '../utils/share';

// Rival formunda kendi DB'den kort arama + yeni kort ekleme
async function fetchCourtsFromDB(city, sport) {
    const { data } = await api.get('/courts/search', { params: { city, sport } });
    return data;
}

// Çiftler (tenis/padel): bireysel başvuru satırlarını karşılıklı partnerId'ye göre
// eşleşmiş çift (pairs) ve partner arayan bireysel (solos) olarak gruplar — backend
// respondToJoin/formTeamsForTournament ile aynı eşleşme mantığı (mutual partnerId).
function groupDoublesPairs(rows) {
    const byUserId = new Map(rows.filter(r => r.userId).map(r => [r.userId, r]));
    const paired = new Set();
    const pairs = [];
    for (const r of rows) {
        if (!r.userId || paired.has(r.userId) || !r.partnerId) continue;
        const partner = byUserId.get(r.partnerId);
        if (partner && partner.partnerId === r.userId && !paired.has(partner.userId)) {
            paired.add(r.userId); paired.add(partner.userId);
            pairs.push([r, partner]);
        }
    }
    const solos = rows.filter(r => r.userId && !paired.has(r.userId));
    return { pairs, solos, byUserId };
}

const SUB_CONFIG = {
    tennis: { name: 'Tennis',   emoji: '🎾', color: 'from-yellow-500 to-orange-500', bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30'  },
    padel:  { name: 'Padel',    emoji: '🏓', color: 'from-cyan-500 to-blue-500',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30'    },
    football: { name: 'Football', emoji: '⚽', color: 'from-green-500 to-emerald-500', bg: 'bg-green-500/10', border: 'border-green-500/30' },
    basketball: { name: 'Basketball', emoji: '🏀', color: 'from-orange-500 to-red-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
    music: { name: 'Music', emoji: '🎵', color: 'from-purple-500 to-pink-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    fps: { name: 'FPS', emoji: '🎯', color: 'from-red-500 to-rose-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};


const LEFT_TABS = ['rivals', 'tournaments', 'coaches', 'media', 'archive'];

// Wellness branch — no competitive features, no points
const WELLNESS_BRANCHES = new Set(['wellness']);

// Team sports — Player Wanted + Find Opponent tabs
const TEAM_SPORTS = new Set(['volleyball', 'football']);
const TICKET_SPORTS = new Set(['tennis', 'padel', 'volleyball']);
const COACH_EXPANDED_SPORTS = new Set(['tennis', 'padel', 'volleyball']);
const EQUIPMENT_SPORTS = new Set(['tennis', 'padel']);

// 15-minute interval time select (06:00 – 23:45)
const TIME_OPTIONS = (() => {
    const opts = [{ value: '', label: '--:--' }];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 15) {
            const hh = String(h).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            opts.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}` });
        }
    }
    return opts;
})();

function TimeSelect({ value, onChange, className = '' }) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)}
            className={`bg-gray-800 text-white rounded-xl px-3 py-2 border border-gray-700 focus:outline-none text-sm ${className}`}>
            {TIME_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    );
}

const VOLLEYBALL_SURFACES = [
    { id: 'INDOOR', tKey: 'rival.surface_indoor', emoji: '🏟️' },
    { id: 'BEACH',  tKey: 'rival.surface_beach',  emoji: '🏖️' },
    { id: 'GRASS',  tKey: 'rival.surface_grass',  emoji: '🌿' },
];
const VOLLEYBALL_SIZES = [1, 2, 3, 4, 5, 6];

const DURATION_OPTIONS = [
    { value: '30',  label: '30 min'  },
    { value: '60',  label: '1 hour'  },
    { value: '90',  label: '1.5 hrs' },
    { value: '120', label: '2 hours' },
    { value: '150', label: '2.5 hrs' },
    { value: '180', label: '3 hours' },
];

const FOOTBALL_SURFACES = [
    { id: 'HALI_SAHA',  tKey: 'rival.surface_hali_saha', emoji: '🟩' },
    { id: 'CIM_SAHA',   tKey: 'rival.surface_cim_saha',  emoji: '🌿' },
    { id: 'FUTSAL',     tKey: 'rival.surface_futsal',     emoji: '🏟️' },
    { id: 'SOKAK',      tKey: 'rival.surface_sokak',      emoji: '🛣️' },
    { id: 'BEACH',      tKey: 'rival.surface_beach',      emoji: '🏖️' },
    { id: 'BALON',      tKey: 'rival.surface_balon',      emoji: '🎈' },
];
const FOOTBALL_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const TENNIS_SURFACES = [
    { id: 'hard',      tKey: 'rival.hard_court',  emoji: '🔵' },
    { id: 'clay',      tKey: 'rival.clay_court',  emoji: '🟤' },
    { id: 'grass',     tKey: 'rival.grass_court', emoji: '🟢' },
    { id: 'synthetic', tKey: 'rival.synthetic',   emoji: '⚫' },
];

const COURT_NUMBERS = [
    { value: '',  label: '—'       },
    { value: '1', label: '1. Kort' },
    { value: '2', label: '2. Kort' },
    { value: '3', label: '3. Kort' },
    { value: '4', label: '4. Kort' },
    { value: '5', label: '5. Kort' },
    { value: '6', label: '6. Kort' },
    { value: '7', label: '7. Kort' },
    { value: '8', label: '8. Kort' },
    { value: 'A', label: 'A Kortu' },
    { value: 'B', label: 'B Kortu' },
];

// ── Tesis ara + kort rezervasyonu (ilan formu içinden) ──────────────────────
// Gerçek rezervasyon burada oluşturulmuyor — sadece slot seçimi + doğrulaması yapılıp
// RivalForm'a aktarılıyor; kortu fiilen bloke eden rezervasyon "İlan Oluştur"a
// basıldığında yapılır (mobildeki VenueBookingModal ile aynı mantık).
function vbPad(n) { return String(n).padStart(2, '0'); }
function vbDateStr(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${vbPad(d.getMonth() + 1)}-${vbPad(d.getDate())}`;
}
const VB_DATE_OPTIONS = Array.from({ length: 14 }, (_, i) => vbDateStr(i));
function vbDateLabel(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
}
function vbIsPastSlot(date, timeStr) { return new Date(`${date}T${timeStr}:00`).getTime() < Date.now(); }
const VB_SLOT_TYPE_LABEL = { FULL_HOUR: 'Tam Saat', HALF_HOUR: 'Buçuklu', NINETY_MIN: '90 Dakika', VAR_DURATION: 'Esnek Saat', FLEXIBLE: 'Esnek Saat' };

function VenueCourtColumn({ court, data, date, selected, onPick }) {
    const [varStart, setVarStart] = useState(null);
    if (!data || data.loading) {
        return <div className="w-40 shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-3"><p className="text-white font-bold text-sm mb-2">{court.name}</p><p className="text-gray-500 text-xs text-center py-6">Yükleniyor...</p></div>;
    }
    if (data.error || !data.type) {
        return <div className="w-40 shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-3"><p className="text-white font-bold text-sm mb-2">{court.name}</p><p className="text-red-400 text-xs text-center py-6">Yüklenemedi</p></div>;
    }
    if (data.type === 'NOT_YET_OPEN') {
        return <div className="w-40 shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-3"><p className="text-white font-bold text-sm mb-2">{court.name}</p><p className="text-yellow-400 text-xs text-center py-6">⏳ {data.message || 'Henüz açılmadı'}</p></div>;
    }
    if (data.type === 'MAINTENANCE') {
        return <div className="w-40 shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-3"><p className="text-white font-bold text-sm mb-2">{court.name}</p><p className="text-orange-400 text-xs text-center py-6">🔧 Bakımda</p></div>;
    }

    if (data.type === 'VAR_DURATION' || data.type === 'FLEXIBLE') {
        const windows = data.windows || [];
        const DURATIONS = [60, 90, 120, 150, 180];
        return (
            <div className="w-52 shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-white font-bold text-sm mb-2">{court.name}</p>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                    {windows.length === 0 && <p className="text-gray-500 text-xs text-center py-6">Boş pencere yok</p>}
                    {windows.map((w, i) => {
                        const isSel = varStart?.start === w.start;
                        return (
                            <div key={i} className={`rounded-lg border p-2 ${isSel ? 'border-purple-500 bg-purple-600/10' : 'border-gray-700'}`}>
                                <button type="button" onClick={() => setVarStart(isSel ? null : w)} className="w-full text-left">
                                    <p className="text-gray-300 text-xs font-bold">{w.start}–{w.end}</p>
                                    <p className="text-gray-500 text-[10px]">{w.pricePerHour > 0 ? `${w.pricePerHour}₺/saat` : 'Ücretsiz'}</p>
                                </button>
                                {isSel && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {DURATIONS.filter(d => d <= w.durationMins).map(d => {
                                            const endM = (parseInt(w.start.split(':')[0], 10) * 60 + parseInt(w.start.split(':')[1], 10)) + d;
                                            const end = `${vbPad(Math.floor(endM / 60) % 24)}:${vbPad(endM % 60)}`;
                                            const price = Math.round((w.pricePerHour || 0) * (d / 60));
                                            const isPicked = selected?.courtId === court.id && selected?.startTime === w.start && selected?.endTime === end;
                                            return (
                                                <button key={d} type="button"
                                                    onClick={() => onPick(court, { start: w.start, end, price, durationMins: d })}
                                                    className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition ${isPicked ? 'bg-green-600/20 border-green-600 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-purple-500'}`}>
                                                    {isPicked ? '✓ ' : ''}{d < 60 ? `${d}dk` : `${d / 60}s`}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // FULL_HOUR / HALF_HOUR / NINETY_MIN
    const slots = data.slots || [];
    return (
        <div className="w-40 shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-3">
            <p className="text-white font-bold text-sm mb-1">{court.name}</p>
            <p className="text-gray-600 text-[10px] mb-2">{VB_SLOT_TYPE_LABEL[data.type] || data.type}</p>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {slots.length === 0 && <p className="text-gray-500 text-xs text-center py-6">Slot yok</p>}
                {slots.map(s => {
                    const isPicked = selected?.courtId === court.id && selected?.startTime === s.start;
                    const isPast = s.free && !s.maintenance && vbIsPastSlot(date, s.start);
                    const disabled = !s.free || s.maintenance || isPast;
                    return (
                        <button key={s.start} type="button" disabled={disabled}
                            onClick={() => onPick(court, { start: s.start, end: s.end, price: s.price || 0 })}
                            className={`w-full text-left px-2 py-1.5 rounded-lg border text-xs font-bold transition ${
                                isPicked ? 'bg-green-600/20 border-green-600 text-green-400'
                                : disabled ? 'bg-gray-800/50 border-gray-800 text-gray-600 cursor-not-allowed'
                                : 'bg-gray-800 border-gray-700 text-gray-200 hover:border-purple-500'
                            }`}>
                            <span className="block">{s.start}–{s.end}</span>
                            <span className="block text-[10px] font-normal opacity-80">
                                {isPicked ? '✓ Seçildi' : !s.free ? (s.status === 'PENDING' ? '⏳ Onay Bekliyor' : 'Dolu') : s.maintenance ? '🔧 Bakım' : isPast ? 'Geçmiş' : (s.price > 0 ? `${s.price}₺` : 'Ücretsiz')}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function VenueSlotPanel({ venue, config, onClose, onConfirm, confirming }) {
    const [date, setDate] = useState(VB_DATE_OPTIONS[0]);
    const [slotsByCourt, setSlotsByCourt] = useState({});
    const [selected, setSelected] = useState(null); // { courtId, courtName, startTime, endTime, price, surface, indoor }

    const fetchAll = useCallback(() => {
        const courts = venue.courts || [];
        setSlotsByCourt(Object.fromEntries(courts.map(c => [c.id, { loading: true }])));
        courts.forEach(c => {
            api.get(`/venues/${venue.id}/courts/${c.id}/slots`, { params: { date } })
                .then(({ data }) => setSlotsByCourt(prev => ({ ...prev, [c.id]: { ...data, loading: false } })))
                .catch(() => setSlotsByCourt(prev => ({ ...prev, [c.id]: { error: true, loading: false } })));
        });
    }, [venue, date]);

    useEffect(() => { fetchAll(); }, [fetchAll]);
    useEffect(() => { setSelected(null); }, [date]);

    const pick = (court, slot) => {
        if (vbIsPastSlot(date, slot.start)) { alert('Geçmiş bir saate rezervasyon yapamazsınız.'); return; }
        setSelected({
            courtId: court.id, courtName: court.name, startTime: slot.start, endTime: slot.end,
            price: slot.price || 0, surface: court.surface || null, indoor: court.indoor ?? venue.courtIndoorDefault ?? false,
        });
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex flex-col" onClick={onClose}>
            <div className="bg-gray-950 flex-1 flex flex-col max-w-5xl w-full mx-auto my-0 sm:my-6 sm:rounded-2xl overflow-hidden border border-gray-800" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-white font-black text-lg truncate">{venue.name}</h3>
                        <p className="text-gray-500 text-xs truncate">📍 {venue.city}{venue.district ? ` / ${venue.district}` : ''}{venue.address ? ` — ${venue.address}` : ''}</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none shrink-0">✕</button>
                </div>

                <div className="flex gap-2 overflow-x-auto px-5 py-3 shrink-0">
                    {VB_DATE_OPTIONS.map(d => (
                        <button key={d} type="button" onClick={() => setDate(d)}
                            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${date === d ? `bg-gradient-to-r ${config.color} border-transparent text-white` : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                            {vbDateLabel(d)}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-x-auto overflow-y-hidden px-5 pb-3">
                    <div className="flex gap-3 h-full">
                        {(venue.courts || []).map(court => (
                            <VenueCourtColumn key={court.id} court={court} data={slotsByCourt[court.id]} date={date} selected={selected} onPick={pick} />
                        ))}
                    </div>
                </div>

                <div className="px-5 py-3 border-t border-gray-800 shrink-0 flex items-center justify-between gap-3">
                    <p className="text-gray-400 text-xs flex-1 min-w-0 truncate">
                        {selected ? `${selected.courtName} · ${vbDateLabel(date)} · ${selected.startTime}–${selected.endTime}${selected.price > 0 ? ` · ${selected.price}₺` : ''}` : 'Bir saat seçin'}
                    </p>
                    <button type="button" disabled={!selected || confirming}
                        onClick={() => onConfirm(venue, date, selected)}
                        className={`bg-gradient-to-r ${config.color} text-white font-bold px-5 py-2 rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50 shrink-0`}>
                        {confirming ? '...' : 'Bu Saati Seç'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function VenueSearchModal({ sub, config, onClose, onBooked, initialName = '' }) {
    const [city, setCity] = useState('');
    const [name, setName] = useState(initialName);
    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [activeVenue, setActiveVenue] = useState(null);
    const [confirming, setConfirming] = useState(false);

    const search = async () => {
        setLoading(true);
        setSearched(true);
        try {
            const { data } = await api.get('/venues/search', { params: { branch: sub, city: city.trim() || undefined, name: name.trim() || undefined } });
            setVenues(data.items || []);
        } catch { setVenues([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const confirmSlot = async (venue, date, slot) => {
        setConfirming(true);
        try {
            await api.post(`/venues/${venue.id}/courts/${slot.courtId}/validate-slot`, {
                date, startTime: slot.startTime, endTime: slot.endTime, paymentMethod: 'CASH',
            });
            onBooked({
                venueId: venue.id, venueCourtId: slot.courtId,
                venueLabel: `${venue.name} — ${slot.courtName}`,
                city: venue.city, address: venue.address,
                date, startTime: slot.startTime, endTime: slot.endTime,
                price: slot.price, surface: slot.surface, indoor: slot.indoor,
                payMethod: (Array.isArray(venue.acceptedPayments) && venue.acceptedPayments.includes('CASH')) ? 'CASH' : (venue.acceptedPayments?.[0] || 'CASH'),
            });
        } catch (e) {
            alert(e?.response?.data?.message || 'Bu saat seçilemiyor, lütfen başka bir saat seçin.');
        } finally { setConfirming(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-black text-lg">🏟️ Tesis Ara</h3>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                    <input value={city} onChange={e => setCity(e.target.value)} placeholder="Şehir"
                        onKeyDown={e => e.key === 'Enter' && search()}
                        className="flex-1 min-w-[120px] bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500" />
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Tesis adı"
                        onKeyDown={e => e.key === 'Enter' && search()}
                        className="flex-1 min-w-[120px] bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500" />
                    <button type="button" onClick={search} disabled={loading}
                        className={`bg-gradient-to-r ${config.color} text-white font-bold px-5 py-2.5 rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50`}>
                        {loading ? '...' : '🔍 Ara'}
                    </button>
                </div>

                {searched && !loading && venues.length === 0 && (
                    <p className="text-gray-500 text-center py-10 text-sm">Sonuç bulunamadı.</p>
                )}
                <div className="space-y-2">
                    {venues.map(v => (
                        <button key={v.id} type="button" onClick={() => setActiveVenue(v)}
                            className="w-full text-left bg-gray-900 border border-gray-800 hover:border-purple-500/50 rounded-xl p-3 transition">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-white font-bold text-sm">{v.name}</p>
                                {v.avgRating ? <span className="text-yellow-400 text-xs font-bold shrink-0">⭐ {v.avgRating}</span> : null}
                            </div>
                            <p className="text-gray-500 text-xs mt-0.5">📍 {v.city}{v.district ? ` / ${v.district}` : ''}{v.address ? ` — ${v.address}` : ''}</p>
                            <span className="inline-block mt-1.5 bg-gray-800 text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded-full">🏟️ {(v.courts || []).length} kort</span>
                        </button>
                    ))}
                </div>
            </div>

            {activeVenue && (
                <VenueSlotPanel venue={activeVenue} config={config} confirming={confirming}
                    onClose={() => setActiveVenue(null)}
                    onConfirm={confirmSlot} />
            )}
        </div>
    );
}

// Rival Form Component
function RivalForm({ config, categoryUpper, sub, onSubmit, onClose, defaultMatchType = 'SINGLE', myId, myInterest }) {
    const { t } = useTranslation();
    const isTeamSport = TEAM_SPORTS.has(sub);
    const isVolleyball = sub === 'volleyball';

    const [form, setForm] = useState({
        message: '',
        level: 'BEGINNER',
        levelDetail: '',
        location: '',
        matchDate: '',
        matchTime: '',
        duration: '',
        isCourtReserved: false,
        flexibleSchedule: false,
        courtName: '',
        courtNumber: '',
        courtAddress: '',
        courtLat: null,
        courtLng: null,
        matchType: defaultMatchType,
        matchMode: 'PRACTICE',
        // Team sport specific
        surface: sub === 'football' ? 'HALI_SAHA' : sub === 'volleyball' ? 'BEACH' : '',
        indoor: null,
        teamSize: sub === 'football' ? 5 : 2,
        genderReq: 'MIX',
        partnerGenderReq: 'MIX',
        opp1GenderReq: 'MIX',
        opp2GenderReq: 'MIX',
        refereeRequested: false,
        refereePayment: '',
        refereeInvites: [],
        // Tesis rezervasyonu (venue kort seçildiğinde dolar) — gerçek rezervasyon
        // ilan submit edilirken yapılır, sadece seçim burada tutulur.
        venueId: null,
        venueCourtId: null,
        venueBookingDate: '',
        venueBookingStart: '',
        venueBookingEnd: '',
        venuePayMethod: 'CASH',
        venueCourtPrice: 0,
        venueLabel: '', // "Tesis Adı — Kort 1" özet gösterimi için
    });
    const [showVenueSearch, setShowVenueSearch] = useState(false);
    const [venueSearchInitialName, setVenueSearchInitialName] = useState('');
    const [refInviteSearchQ, setRefInviteSearchQ] = useState('');
    const [refInviteSearchResults, setRefInviteSearchResults] = useState([]);
    const [refInviteSearchLoading, setRefInviteSearchLoading] = useState(false);
    const [refInviteDraft, setRefInviteDraft] = useState(null); // { id, username, fullName, price, message }

    const searchRefereeInvitees = async (q) => {
        if (q.length < 2) { setRefInviteSearchResults([]); return; }
        setRefInviteSearchLoading(true);
        try {
            const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
            setRefInviteSearchResults(data.filter(u => u.id !== myId && !form.refereeInvites.some(inv => inv.userId === u.id)));
        } catch {} finally { setRefInviteSearchLoading(false); }
    };

    const confirmRefereeInvite = () => {
        if (!refInviteDraft) return;
        setForm(f => ({ ...f, refereeInvites: [...f.refereeInvites, { userId: refInviteDraft.id, username: refInviteDraft.username, fullName: refInviteDraft.fullName, price: refInviteDraft.price, message: refInviteDraft.message }] }));
        setRefInviteDraft(null);
        setRefInviteSearchQ('');
        setRefInviteSearchResults([]);
    };

    const removeRefereeInvite = (userId) => setForm(f => ({ ...f, refereeInvites: f.refereeInvites.filter(i => i.userId !== userId) }));
    const [courts, setCourts] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showCourts, setShowCourts] = useState(false);
    const [courtFromDB, setCourtFromDB] = useState(false);
    const [courtNameQuery, setCourtNameQuery] = useState('');
    const [showAddCourt, setShowAddCourt] = useState(false);
    const [newCourt, setNewCourt] = useState({ name: '', address: '', surface: '', indoor: false, fee: false, feeAmount: '', lights: false });
    const [isAddingCourt, setIsAddingCourt] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Competitive team builder (football COMPETITIVE, teamSize > 1)
    const [senderTeam, setSenderTeam] = useState([]);   // additional teammates (not including self)
    const [teamSearchQ, setTeamSearchQ] = useState('');
    const [teamSearchResults, setTeamSearchResults] = useState([]);
    const [teamSearchLoading, setTeamSearchLoading] = useState(false);

    const isCompetitiveTeam = sub === 'football' && form.matchMode === 'COMPETITIVE' && form.teamSize > 1;
    // Tenis/Padel çiftler: ilanı oluştururken partner seçimi zorunlu (mevcut takım kurucu
    // arayüzü 1 partner aramak için tekrar kullanılıyor — teamSize zaten varsayılan 2).
    const needsPartner     = (sub === 'tennis' || sub === 'padel') && form.matchType === 'DOUBLE';
    const isTeamBuilder     = (sub === 'football' && form.teamSize > 1) || needsPartner;
    const spotsLeft = form.teamSize - 1 - senderTeam.length; // how many more teammates needed

    const searchTeammates = async (q) => {
        if (q.length < 2) { setTeamSearchResults([]); return; }
        setTeamSearchLoading(true);
        try {
            const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}&subCategory=${sub}&category=${categoryUpper}`);
            setTeamSearchResults(data.filter(u => u.id !== myId && !senderTeam.some(t => t.id === u.id)));
        } catch {} finally { setTeamSearchLoading(false); }
    };

    const addTeammate = (user) => {
        if (senderTeam.length >= form.teamSize - 1) return;
        const interest = (user.interests || []).find(i => i.subCategory === sub);
        setSenderTeam(prev => [...prev, { id: user.id, username: user.username, fullName: user.fullName, skillRating: interest?.skillRating || 0, assessmentCompleted: interest?.assessmentCompleted || false }]);
        setTeamSearchResults([]);
        setTeamSearchQ('');
    };

    const removeTeammate = (userId) => setSenderTeam(prev => prev.filter(t => t.id !== userId));

    const teamAvgRating = (() => {
        const myRating = myInterest?.skillRating || 0;
        const all = [myRating, ...senderTeam.map(t => t.skillRating)];
        return (all.reduce((s, r) => s + r, 0) / all.length).toFixed(2);
    })();

    const handleCitySearch = async () => {
        if (!form.location) return;
        setIsSearching(true);
        setShowCourts(true);
        setShowAddCourt(false);
        try {
            const results = await fetchCourtsFromDB(form.location, sub);
            setCourts(results);
        } catch {
            setCourts([]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleCourtNameSearch = async () => {
        if (!courtNameQuery) return;
        setIsSearching(true);
        setShowCourts(true);
        try {
            const { data } = await api.get('/courts/search', { params: { name: courtNameQuery, sport: sub } });
            setCourts(data);
        } catch {
            setCourts([]);
        } finally {
            setIsSearching(false);
        }
    };

    const selectCourt = (court) => {
        if (court.isBusinessVenue) {
            // Onaylı bir tesis olarak kayıtlı — düz metin kort adı yerine gerçek
            // rezervasyon akışına (Tesis Ara) yönlendir.
            setShowCourts(false);
            setShowAddCourt(false);
            setVenueSearchInitialName(court.name);
            setShowVenueSearch(true);
            return;
        }
        setForm(prev => ({
            ...prev,
            courtName: court.name,
            courtAddress: court.address || '',
            courtLat: court.lat,
            courtLng: court.lng,
            ...(sub === 'tennis' && court.city && { location: court.city }),
        }));
        if (sub === 'tennis') {
            setCourtNameQuery(court.name);
            setCourtFromDB(true);
        }
        setShowCourts(false);
        setShowAddCourt(false);
    };

    const handleAddCourt = async () => {
        if (!newCourt.name || !form.location) return;
        setIsAddingCourt(true);
        try {
            const { data } = await api.post('/courts', {
                ...newCourt,
                city: form.location,
                sport: sub,
            });
            selectCourt(data);
            setNewCourt({ name: '', address: '', surface: '', indoor: false, fee: false, feeAmount: '', lights: false });
            setCourts(prev => [data, ...prev]);
        } catch (err) {
            console.error(err);
        } finally {
            setIsAddingCourt(false);
        }
    };

    const applyVenueBooking = (b) => {
        const [sh, sm] = b.startTime.split(':').map(Number);
        const [eh, em] = b.endTime.split(':').map(Number);
        const durationMins = (eh * 60 + em) - (sh * 60 + sm);
        setForm(f => ({
            ...f,
            venueId: b.venueId,
            venueCourtId: b.venueCourtId,
            venueBookingDate: b.date,
            venueBookingStart: b.startTime,
            venueBookingEnd: b.endTime,
            venuePayMethod: b.payMethod,
            venueCourtPrice: b.price,
            venueLabel: b.venueLabel,
            isCourtReserved: true,
            matchDate: b.date,
            matchTime: b.startTime,
            duration: durationMins > 0 ? String(durationMins) : f.duration,
            location: f.location || b.city || '',
            courtName: b.venueLabel,
            courtAddress: b.address || '',
            ...(b.surface && { surface: b.surface }),
            ...(b.indoor !== null && b.indoor !== undefined && { indoor: b.indoor }),
        }));
        setShowVenueSearch(false);
    };

    const clearVenueBooking = () => setForm(f => ({
        ...f, venueId: null, venueCourtId: null, venueBookingDate: '', venueBookingStart: '', venueBookingEnd: '',
        venuePayMethod: 'CASH', venueCourtPrice: 0, venueLabel: '', isCourtReserved: false,
    }));

    const [validationError, setValidationError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setValidationError('');

        if (sub === 'tennis' && !form.flexibleSchedule) {
            const missing = [];
            if (!form.matchType)        missing.push('Format');
            if (!form.matchMode)        missing.push('Mode');
            if (!form.matchDate)        missing.push('Date');
            if (!form.matchTime)        missing.push('Start Time');
            if (!form.duration)         missing.push('Duration');
            if (!form.location?.trim()) missing.push('City');
            if (missing.length > 0) {
                setValidationError(`Please fill in: ${missing.join(', ')}`);
                return;
            }
        }
        if (needsPartner && senderTeam.length === 0) {
            setValidationError(t('rival.choose_partner_warn'));
            return;
        }

        setIsSubmitting(true);
        // Tesis kortu seçildiyse gerçek rezervasyon burada, ilan gönderilmeden hemen önce
        // oluşturulur (form yarım kalırsa kort boşa bloke edilmesin diye şimdiye kadar ertelendi).
        let venueReservationId = null;
        try {
            if (form.venueId && form.venueCourtId) {
                const { data: resData } = await api.post(`/venues/${form.venueId}/courts/${form.venueCourtId}/reserve`, {
                    date: form.venueBookingDate, startTime: form.venueBookingStart, endTime: form.venueBookingEnd,
                    paymentMethod: form.venuePayMethod || 'CASH',
                });
                venueReservationId = resData?.reservation?.id || null;
            }

            const combinedCourtName = form.courtNumber && form.courtName
            ? `${form.courtName} · ${form.courtNumber}`
            : form.courtName || form.courtNumber || '';
        const payload = {
                category: categoryUpper,
                subCategory: sub,
                ...form,
                courtName: combinedCourtName,
                matchType: form.matchType,
                matchMode: form.matchMode,
                ...(form.duration && { duration: Number(form.duration) }),
                ...(isTeamSport && { teamSize: form.teamSize, surface: form.surface }),
                ...(isTeamBuilder && senderTeam.length > 0 && { senderTeam }),
                ...(venueReservationId && { venueReservationId }),
            };
        delete payload.courtNumber;
            delete payload.venueBookingDate; delete payload.venueBookingStart; delete payload.venueBookingEnd;
            delete payload.venuePayMethod; delete payload.venueCourtPrice; delete payload.venueLabel;
            if (sub === 'tennis') { delete payload.level; delete payload.levelDetail; delete payload.teamSize; }
            if (!isTeamSport && sub !== 'tennis') { delete payload.surface; delete payload.teamSize; }
            const { data } = await api.post('/rivals', payload);
            onSubmit(data);
        } catch (err) {
            console.error(err);
            if (venueReservationId) {
                api.delete(`/venues/reservations/${venueReservationId}`).catch(() => {});
            }
            setValidationError(err?.response?.data?.message || err?.message || 'Sunucu hatası');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-5 border border-purple-500/30 space-y-4">
            <div className="flex justify-between items-center">
                <h4 className="text-white font-bold">📋 {t('rival.form_title')}</h4>
                <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            {/* Team sports: Surface (volleyball only) + Team Size */}
            {isTeamSport ? (
                <>
                    {/* Surface type */}
                    <div>
                        <label className="text-gray-400 text-xs mb-2 block">
                            {isVolleyball ? t('rival.court_type') : t('rival.field_type')}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {(isVolleyball ? VOLLEYBALL_SURFACES : FOOTBALL_SURFACES).map(s => (
                                <button key={s.id} type="button"
                                    onClick={() => setForm(f => ({ ...f, surface: s.id }))}
                                    className={`flex flex-col items-center py-2.5 rounded-xl border font-bold text-xs transition ${form.surface === s.id ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                                    <span className="text-xl mb-0.5">{s.emoji}</span>
                                    <span className="text-center leading-tight">{t(s.tKey)}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Players per side */}
                    <div>
                        <label className="text-gray-400 text-xs mb-2 block">{t('rival.players_per_side')}</label>
                        <div className="grid grid-cols-5 gap-1.5">
                            {(isVolleyball ? VOLLEYBALL_SIZES : FOOTBALL_SIZES).map(n => (
                                <button key={n} type="button"
                                    onClick={() => setForm(f => ({ ...f, teamSize: n }))}
                                    className={`py-2.5 rounded-xl border font-black text-sm transition ${form.teamSize === n ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                                    {n}v{n}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            ) : (
            /* Match format: Single / Double */
            <div>
                <label className="text-gray-400 text-xs mb-2 block">{t('rival.format')}</label>
                <div className="grid grid-cols-2 gap-2">
                    {[
                        { value: 'SINGLE', icon: '🎾', label: t('rival.single_label'), desc: '1 vs 1' },
                        { value: 'DOUBLE', icon: '🎾🎾', label: t('rival.double_label'), desc: '2 vs 2' },
                    ].map(opt => (
                        <button key={opt.value} type="button"
                            onClick={() => setForm(f => ({ ...f, matchType: opt.value }))}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition ${form.matchType === opt.value ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                            <span className="text-xl">{opt.icon}</span>
                            <div><p className="font-bold text-sm">{opt.label}</p><p className="text-xs opacity-70">{opt.desc}</p></div>
                        </button>
                    ))}
                </div>
            </div>
            )}

            {/* Gender restriction — tennis/padel only */}
            {(sub === 'tennis' || sub === 'padel') && form.matchType === 'SINGLE' && (
                <div>
                    <label className="text-gray-400 text-xs mb-2 block">{t('rival.gender_req_label')}</label>
                    <div className="flex gap-2">
                        {[
                            { id: 'MIX', label: t('rival.gender_mix') },
                            { id: 'MALE', label: t('rival.gender_male') },
                            { id: 'FEMALE', label: t('rival.gender_female') },
                        ].map(g => (
                            <button key={g.id} type="button" onClick={() => setForm(f => ({ ...f, genderReq: g.id }))}
                                className={`flex-1 py-2 rounded-xl border font-bold text-xs transition ${form.genderReq === g.id ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                                {g.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Match mode: Practice / Competitive */}
            <div>
                <label className="text-gray-400 text-xs mb-2 block">{t('rival.mode')}</label>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setForm(f => {
                        if (!f.flexibleSchedule) return { ...f, matchMode: 'PRACTICE' };
                        if (f.matchMode === 'BOTH') return { ...f, matchMode: 'COMPETITIVE' };
                        if (f.matchMode === 'COMPETITIVE') return { ...f, matchMode: 'BOTH' };
                        return f;
                    })}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition ${(form.matchMode === 'PRACTICE' || form.matchMode === 'BOTH') ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                        <span className="text-xl">🏃</span>
                        <div>
                            <p className="font-bold text-sm">{t('rival.practice')}</p>
                            <p className="text-xs opacity-70">{t('rival.practice_desc')}</p>
                        </div>
                    </button>
                    <button type="button" onClick={() => setForm(f => {
                        if (!f.flexibleSchedule) return { ...f, matchMode: 'COMPETITIVE' };
                        if (f.matchMode === 'BOTH') return { ...f, matchMode: 'PRACTICE' };
                        if (f.matchMode === 'PRACTICE') return { ...f, matchMode: 'BOTH' };
                        return f;
                    })}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-left transition ${(form.matchMode === 'COMPETITIVE' || form.matchMode === 'BOTH') ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                        <span className="text-xl">⚔️</span>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm">{t('rival.competitive')}</p>
                            <p className="text-xs opacity-70">{t('rival.competitive_desc')}</p>
                        </div>
                        <p className="text-[10px] leading-tight text-yellow-200 bg-black/20 rounded-lg px-2 py-1 shrink-0 max-w-[90px] text-right">
                            {t('rival.competitive_warn')}
                        </p>
                    </button>
                </div>
            </div>

            {/* ── TEAM BUILDER (football, teamSize > 1, any mode) ── */}
            {!form.flexibleSchedule && isTeamBuilder && (
                <div className="bg-gray-800/60 border border-green-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-white font-bold text-sm">⚽ {t('rival.build_team')}</p>
                        <div className="text-right">
                            <p className={`font-black text-sm bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                {teamAvgRating} ★ {t('rival.avg')}
                            </p>
                            <p className="text-gray-500 text-[10px]">{senderTeam.length + 1}/{form.teamSize} {t('rival.players')}</p>
                        </div>
                    </div>

                    {needsPartner && (
                        <div className="space-y-2 border-t border-gray-700 pt-3">
                            {[
                                { field: 'partnerGenderReq', label: t('rival.partner_gender_label') },
                                { field: 'opp1GenderReq', label: t('rival.opp1_gender_label') },
                                { field: 'opp2GenderReq', label: t('rival.opp2_gender_label') },
                            ].map(row => (
                                <div key={row.field} className="flex items-center gap-2 flex-wrap">
                                    <span className="text-gray-400 text-xs flex-shrink-0">{row.label}</span>
                                    <div className="flex gap-1.5">
                                        {[
                                            { id: 'MIX', label: t('rival.gender_mix') },
                                            { id: 'MALE', label: t('rival.gender_male') },
                                            { id: 'FEMALE', label: t('rival.gender_female') },
                                        ].map(g => (
                                            <button key={g.id} type="button" onClick={() => setForm(f => ({ ...f, [row.field]: g.id }))}
                                                className={`px-2.5 py-1 rounded-lg border font-bold text-[11px] transition ${form[row.field] === g.id ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'}`}>
                                                {g.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Team list — self + teammates */}
                    <div className="space-y-1.5">
                        {/* Self (always first) */}
                        <div className="flex items-center gap-2 bg-gray-700/60 rounded-xl px-3 py-2">
                            <div className={`w-6 h-6 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                                {myInterest ? '★' : '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-xs font-bold">{t('rival.you_captain')}</p>
                            </div>
                            {myInterest?.assessmentCompleted && (
                                <span className={`text-[10px] font-black bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                    {Number(myInterest.skillRating).toFixed(2)}★
                                </span>
                            )}
                        </div>
                        {senderTeam.map(tm => (
                            <div key={tm.id} className="flex items-center gap-2 bg-gray-700/40 rounded-xl px-3 py-2">
                                <div className={`w-6 h-6 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                                    {tm.username?.[0]?.toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-xs font-bold truncate">{tm.fullName || tm.username}</p>
                                    <p className="text-gray-500 text-[10px]">@{tm.username}</p>
                                </div>
                                {tm.assessmentCompleted && (
                                    <span className={`text-[10px] font-black bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                        {Number(tm.skillRating).toFixed(2)}★
                                    </span>
                                )}
                                <button type="button" onClick={() => removeTeammate(tm.id)}
                                    className="text-red-400 hover:text-red-300 text-xs ml-1 flex-shrink-0">✕</button>
                            </div>
                        ))}
                    </div>

                    {/* Search to add more */}
                    {spotsLeft > 0 && (
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={teamSearchQ}
                                    onChange={e => { setTeamSearchQ(e.target.value); searchTeammates(e.target.value); }}
                                    placeholder={spotsLeft > 1 ? t('rival.search_players', { n: spotsLeft }) : t('rival.search_player', { n: spotsLeft })}
                                    className="flex-1 bg-gray-700 text-white rounded-xl px-3 py-2 border border-gray-600 focus:outline-none focus:border-green-500 text-xs"
                                />
                                {teamSearchLoading && <span className="text-gray-400 text-xs self-center">...</span>}
                            </div>
                            {teamSearchResults.length > 0 && (
                                <div className="bg-gray-700 rounded-xl border border-gray-600 overflow-hidden">
                                    {teamSearchResults.slice(0, 5).map(u => {
                                        const interest = (u.interests || []).find(i => i.subCategory === sub);
                                        return (
                                            <button key={u.id} type="button" onClick={() => addTeammate(u)}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-600 transition text-left border-b border-gray-600/50 last:border-0">
                                                <div className={`w-7 h-7 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                                    {u.username?.[0]?.toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-xs font-bold truncate">{u.fullName || u.username}</p>
                                                    <p className="text-gray-500 text-[10px]">@{u.username}</p>
                                                </div>
                                                {interest?.assessmentCompleted ? (
                                                    <span className={`text-[10px] font-black bg-gradient-to-r ${config.color} bg-clip-text text-transparent flex-shrink-0`}>
                                                        {Number(interest.skillRating).toFixed(2)}★
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-600 text-[10px] flex-shrink-0">{t('rival.no_rating')}</span>
                                                )}
                                                <span className="text-green-400 text-xs flex-shrink-0">{t('rival.add_player')}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                    {spotsLeft === 0 && (
                        <p className="text-green-400 text-xs text-center font-bold">{t('rival.team_full')}</p>
                    )}
                    {(isCompetitiveTeam || needsPartner) && (
                        <p className="text-yellow-400 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                            {t('rival.team_elo_note', { avg: teamAvgRating })}
                        </p>
                    )}
                </div>
            )}

            <div>
                <label className="text-gray-400 text-xs mb-1 block">{t('rival.description')}</label>
                <textarea
                    value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                    placeholder={t('rival.description_placeholder', { sport: config.name })}
                    className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500 resize-none text-sm"
                    rows={3}
                />
            </div>

            {/* Flexible schedule toggle */}
            <label className={`flex items-start gap-3 rounded-xl px-4 py-3 cursor-pointer border transition ${form.flexibleSchedule ? 'bg-blue-500/10 border-blue-500/40' : 'bg-gray-800 border-gray-700 hover:border-gray-500'}`}>
                <input
                    type="checkbox"
                    checked={form.flexibleSchedule}
                    onChange={e => setForm(f => ({ ...f, flexibleSchedule: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 accent-blue-500 cursor-pointer flex-shrink-0"
                />
                <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-bold ${form.flexibleSchedule ? 'text-blue-400' : 'text-gray-300'}`}>
                            📅 {t('rival.flexible_schedule')}
                        </p>
                        <span className="text-yellow-400 text-[10px] font-bold whitespace-nowrap">
                            {t('rival.expires_24h')}
                        </span>
                    </div>
                    <p className="text-gray-400 text-[11px] leading-relaxed mt-0.5">
                        {t('rival.flexible_schedule_desc')}
                    </p>
                </div>
            </label>

            {!form.flexibleSchedule && sub !== 'tennis' && (
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-gray-400 text-xs mb-1 block">{t('rival.level')} *</label>
                    <select
                        value={form.level}
                        onChange={e => setForm({ ...form, level: e.target.value })}
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2 border border-gray-700 focus:outline-none text-sm"
                    >
                        <option value="BEGINNER">🟢 Beginner</option>
                        <option value="INTERMEDIATE">🟡 Intermediate</option>
                        <option value="ADVANCED">🟠 Advanced</option>
                        <option value="PRO">🔴 Pro</option>
                    </select>
                </div>
                <div>
                    <label className="text-gray-400 text-xs mb-1 block">{t('rival.level_detail')}</label>
                    <input
                        value={form.levelDetail}
                        onChange={e => setForm({ ...form, levelDetail: e.target.value })}
                        placeholder="e.g. 3.5 NTRP, UTR 8"
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2 border border-gray-700 focus:outline-none text-sm"
                    />
                </div>
            </div>
            )}

            {!form.flexibleSchedule && (sub === 'tennis' ? (
                <div className="grid grid-cols-3 gap-2">
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">📅 {t('rival.date_label')}</label>
                        <input
                            type="date" onClick={e => e.target.showPicker?.()}
                            value={form.matchDate}
                            onChange={e => setForm({ ...form, matchDate: e.target.value })}
                            className="w-full bg-gray-800 text-white rounded-xl px-2 py-2 border border-gray-700 focus:outline-none text-xs"
                        />
                    </div>
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">🕐 {t('rival.time')}</label>
                        <TimeSelect value={form.matchTime} onChange={v => setForm({ ...form, matchTime: v })} className="w-full text-xs" />
                    </div>
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">⏱️ {t('rival.duration')}</label>
                        <select
                            value={form.duration}
                            onChange={e => setForm({ ...form, duration: e.target.value })}
                            className="w-full bg-gray-800 text-white rounded-xl px-2 py-2 border border-gray-700 focus:outline-none text-xs"
                        >
                            <option value="">—</option>
                            {DURATION_OPTIONS.map(d => (
                                <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            ) : (
            <>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-gray-400 text-xs mb-1 block">📅 {t('rival.date_label')}</label>
                    <input
                        type="date" onClick={e => e.target.showPicker?.()}
                        value={form.matchDate}
                        onChange={e => setForm({ ...form, matchDate: e.target.value })}
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2 border border-gray-700 focus:outline-none text-sm"
                    />
                </div>
                <div>
                    <label className="text-gray-400 text-xs mb-1 block">🕐 {t('rival.start_time')}</label>
                    <TimeSelect value={form.matchTime} onChange={v => setForm({ ...form, matchTime: v })} className="w-full" />
                </div>
            </div>

            {/* Duration */}
            <div>
                <label className="text-gray-400 text-xs mb-2 block">⏱️ {t('rival.duration')}</label>
                <div className="grid grid-cols-6 gap-1.5">
                    {DURATION_OPTIONS.map(d => (
                        <button key={d.value} type="button"
                            onClick={() => setForm(f => ({ ...f, duration: f.duration === d.value ? '' : d.value }))}
                            className={`py-2 rounded-xl border font-bold text-xs transition ${form.duration === d.value ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                            {d.label}
                        </button>
                    ))}
                </div>
            </div>
            </>
            ))}

            {!form.flexibleSchedule && (sub === 'tennis' ? (
                /* ── Tennis: Court name first → DB auto-fill OR manual city+address → surface ── */
                <div className="space-y-3">
                    {/* Step 1: Court name search */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">🏟️ {t('rival.court_name')}</label>
                        <div className="flex gap-2">
                            <input
                                value={courtNameQuery}
                                onChange={e => {
                                    setCourtNameQuery(e.target.value);
                                    setCourtFromDB(false);
                                    setForm(f => ({ ...f, courtName: e.target.value }));
                                }}
                                placeholder={t('rival.search_court')}
                                className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                            />
                            <select
                                value={form.courtNumber}
                                onChange={e => setForm(f => ({ ...f, courtNumber: e.target.value }))}
                                className="w-24 bg-gray-800 text-white rounded-xl px-2 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-xs flex-shrink-0"
                            >
                                {COURT_NUMBERS.map(cn => (
                                    <option key={cn.value} value={cn.value}>{cn.label}</option>
                                ))}
                            </select>
                            <button type="button" onClick={handleCourtNameSearch} disabled={isSearching}
                                className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white font-bold px-3 py-2 rounded-xl text-sm disabled:opacity-50 transition">
                                {isSearching ? '...' : '🔍'}
                            </button>
                        </div>
                    </div>

                    {/* DB suggestions */}
                    {showCourts && courts.length > 0 && (
                        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                            <p className="text-gray-500 text-xs px-3 py-2 border-b border-gray-700">
                                🏟️ {t(courts.length > 1 ? 'rival.courts_found_plural' : 'rival.courts_found', { n: courts.length })}
                            </p>
                            <div className="max-h-60 overflow-y-auto">
                                {courts.map(court => (
                                    <button key={court.id} type="button" onClick={() => selectCourt(court)}
                                        className="w-full text-left px-4 py-3 hover:bg-gray-700 transition border-b border-gray-700/50 last:border-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-white text-sm font-bold flex-1">{court.name}</p>
                                            {court.verified
                                                ? <span className="text-green-400 text-[10px] font-bold bg-green-500/10 px-1.5 py-0.5 rounded">{t('rival.verified')}</span>
                                                : <span className="text-yellow-500 text-[10px] bg-yellow-500/10 px-1.5 py-0.5 rounded">{t('rival.pending')}</span>
                                            }
                                        </div>
                                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                            {court.city    && <span className="text-gray-400 text-xs">📍 {court.city}</span>}
                                            {court.address && <span className="text-gray-400 text-xs">🏠 {court.address}</span>}
                                            {court.surface && <span className="text-gray-400 text-xs">🎾 {court.surface}</span>}
                                            {court.indoor != null && <span className="text-gray-400 text-xs">{court.indoor ? `🏠 ${t('rival.indoor')}` : `☀️ ${t('rival.outdoor')}`}</span>}
                                            {court.fee     && <span className="text-yellow-500 text-xs">💰 {court.feeAmount || 'Paid'}</span>}
                                            {court.lights  && <span className="text-gray-400 text-xs">💡 {t('rival.lights')}</span>}
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <button type="button" onClick={() => setShowCourts(false)}
                                className="w-full py-2 text-gray-600 hover:text-gray-400 text-xs transition">✕ Close</button>
                        </div>
                    )}
                    {/* Step 2: auto-filled banner OR manual city+address (only when search returned no results) */}
                    {courtFromDB ? (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
                            <span className="text-green-400">✓</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-green-400 text-xs font-bold truncate">{form.courtName}</p>
                                <p className="text-gray-400 text-xs">{form.location}{form.courtAddress ? ` · ${form.courtAddress}` : ''}</p>
                            </div>
                            <button type="button" onClick={() => {
                                setCourtFromDB(false);
                                setCourtNameQuery('');
                                setForm(f => ({ ...f, courtName: '', courtNumber: '', courtAddress: '', courtLat: null, courtLng: null, location: '' }));
                            }} className="text-gray-500 hover:text-red-400 text-xs ml-1 flex-shrink-0">✕</button>
                        </div>
                    ) : showCourts && !isSearching && courts.length === 0 ? (
                        <div className="space-y-2">
                            <p className="text-gray-500 text-xs text-center py-1">{t('rival.no_courts_found')}</p>
                            <div className="flex gap-2">
                                <div className="w-1/3 flex-shrink-0">
                                    <label className="text-gray-400 text-xs mb-1 block">📍 {t('rival.city')} *</label>
                                    <input
                                        value={form.location}
                                        onChange={e => setForm({ ...form, location: e.target.value })}
                                        placeholder={t('rival.city_placeholder')}
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-gray-400 text-xs mb-1 block">📌 {t('rival.address')}</label>
                                    <input
                                        value={form.courtAddress}
                                        onChange={e => setForm({ ...form, courtAddress: e.target.value })}
                                        placeholder={t('rival.address_placeholder')}
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {/* Step 3 + 4: Surface & Venue side by side */}
                    <div className="flex gap-3 items-start">
                        <div className="flex-1">
                            <label className="text-gray-400 text-xs mb-2 block">🎾 {t('rival.court_surface')}</label>
                            <div className="flex flex-wrap gap-1.5">
                                {TENNIS_SURFACES.map(s => (
                                    <button key={s.id} type="button"
                                        onClick={() => setForm(f => ({ ...f, surface: s.id }))}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border font-bold text-xs transition whitespace-nowrap ${form.surface === s.id ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                                        <span>{s.emoji}</span>
                                        <span>{t(s.tKey)}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs mb-2 block">🏟️ {t('rival.venue_type')}</label>
                            <div className="flex gap-1.5">
                                {[
                                    { value: false, label: t('rival.outdoor'), emoji: '☀️' },
                                    { value: true,  label: t('rival.indoor'),  emoji: '🏠' },
                                    { value: null,  label: t('rival.unknown'), emoji: '❓' },
                                ].map(opt => (
                                    <button key={String(opt.value)} type="button"
                                        onClick={() => setForm(f => ({ ...f, indoor: opt.value }))}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border font-bold text-xs transition whitespace-nowrap ${form.indoor === opt.value ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                                        <span>{opt.emoji}</span>
                                        <span>{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* ── Non-tennis: City first → court name → DB suggestions ── */
                <>
                <div className="flex gap-2">
                    <div className="w-1/3 flex-shrink-0">
                        <label className="text-gray-400 text-xs mb-1 block">📍 {t('rival.city')}</label>
                        <input
                            value={form.location}
                            onChange={e => setForm({ ...form, location: e.target.value })}
                            placeholder={t('rival.city_placeholder')}
                            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-gray-400 text-xs mb-1 block">📌 {t('rival.address_label')}</label>
                        <input
                            value={form.courtAddress}
                            onChange={e => setForm({ ...form, courtAddress: e.target.value })}
                            placeholder={t('rival.address_placeholder')}
                            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                        />
                    </div>
                </div>

                {form.location && (
                    <>
                        <div>
                            <label className="text-gray-400 text-xs mb-1 block">🏟️ {t('rival.court_name')}</label>
                            <div className="flex gap-2">
                                <input
                                    value={form.courtName}
                                    onChange={e => setForm({ ...form, courtName: e.target.value })}
                                    placeholder="e.g. Beach Park, City Sports Center..."
                                    className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                />
                                <select
                                    value={form.courtNumber}
                                    onChange={e => setForm(f => ({ ...f, courtNumber: e.target.value }))}
                                    className="w-24 bg-gray-800 text-white rounded-xl px-2 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-xs flex-shrink-0"
                                >
                                    {COURT_NUMBERS.map(cn => (
                                        <option key={cn.value} value={cn.value}>{cn.label}</option>
                                    ))}
                                </select>
                                <button type="button" onClick={handleCitySearch} disabled={isSearching}
                                    className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white font-bold px-3 py-2 rounded-xl text-sm disabled:opacity-50 whitespace-nowrap transition">
                                    {isSearching ? '...' : '🔍'}
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {showCourts && courts.length > 0 && (
                    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                        <p className="text-gray-500 text-xs px-3 py-2 border-b border-gray-700">
                            🏟️ {t('rival.courts_db')}
                        </p>
                        <div className="max-h-40 overflow-y-auto">
                            {courts.map(court => (
                                <button key={court.id} type="button" onClick={() => selectCourt(court)}
                                    className="w-full text-left px-4 py-2.5 hover:bg-gray-700 transition border-b border-gray-700/50 last:border-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-white text-sm font-bold flex-1">{court.name}</p>
                                        {court.verified && <span className="text-green-400 text-[10px]">{t('rival.verified')}</span>}
                                    </div>
                                    {court.address && <p className="text-gray-500 text-xs">{court.address}</p>}
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={() => setShowCourts(false)}
                            className="w-full py-2 text-gray-600 hover:text-gray-400 text-xs transition">
                            ✕ Close
                        </button>
                    </div>
                )}
                </>
            ))}

            {/* Yeni Kort Ekleme Formu */}
            {!form.flexibleSchedule && showAddCourt && (
                <div className="bg-gray-800 rounded-xl border border-purple-500/40 p-4 space-y-3">
                    <p className="text-white text-sm font-bold">🏟️ {t('rival.add_new_court')}</p>
                    <input
                        value={newCourt.name}
                        onChange={e => setNewCourt({ ...newCourt, name: e.target.value })}
                        placeholder={t('rival.court_name_placeholder')}
                        className="w-full bg-gray-700 text-white rounded-xl px-3 py-2 border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                    />
                    <input
                        value={newCourt.address}
                        onChange={e => setNewCourt({ ...newCourt, address: e.target.value })}
                        placeholder={t('rival.address_optional')}
                        className="w-full bg-gray-700 text-white rounded-xl px-3 py-2 border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
                    />
                    {/* Surface Type */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">{t('rival.surface_type')}</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {[
                                { value: 'hard', label: t('rival.hard_court') },
                                { value: 'clay', label: t('rival.clay_court') },
                                { value: 'grass', label: t('rival.grass_court') },
                                { value: 'artificial_grass', label: t('rival.artificial_grass') },
                                { value: 'carpet', label: t('rival.carpet') },
                                { value: 'synthetic', label: t('rival.synthetic') },
                            ].map(s => (
                                <button
                                    key={s.value}
                                    type="button"
                                    onClick={() => setNewCourt({ ...newCourt, surface: s.value })}
                                    className={`py-1.5 rounded-lg text-xs font-medium transition border ${newCourt.surface === s.value ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'}`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Indoor / Outdoor */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">{t('rival.venue_type')}</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setNewCourt({ ...newCourt, indoor: false })}
                                className={`py-2 rounded-xl text-xs font-bold border transition ${!newCourt.indoor ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'}`}
                            >
                                🌤️ {t('rival.outdoor')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setNewCourt({ ...newCourt, indoor: true })}
                                className={`py-2 rounded-xl text-xs font-bold border transition ${newCourt.indoor ? 'bg-purple-600/20 border-purple-500 text-purple-400' : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'}`}
                            >
                                🏠 {t('rival.indoor')}
                            </button>
                        </div>
                    </div>

                    {/* Fee */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">{t('rival.fee')}</label>
                        <div className="flex gap-2 mb-2">
                            <button
                                type="button"
                                onClick={() => setNewCourt({ ...newCourt, fee: false, feeAmount: '' })}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${!newCourt.fee ? 'bg-green-600/20 border-green-500 text-green-400' : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'}`}
                            >
                                ✅ {t('rival.free')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setNewCourt({ ...newCourt, fee: true })}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${newCourt.fee ? 'bg-yellow-600/20 border-yellow-500 text-yellow-400' : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'}`}
                            >
                                💰 {t('rival.paid')}
                            </button>
                        </div>
                        {newCourt.fee && (
                            <input
                                value={newCourt.feeAmount}
                                onChange={e => setNewCourt({ ...newCourt, feeAmount: e.target.value })}
                                placeholder={t('rival.fee_placeholder')}
                                className="w-full bg-gray-700 text-white rounded-xl px-3 py-2 border border-gray-600 focus:outline-none focus:border-yellow-500 text-sm"
                            />
                        )}
                    </div>

                    {/* Lights */}
                    <label className="flex items-center gap-2 bg-gray-700 rounded-xl px-3 py-2 cursor-pointer border border-gray-600 hover:border-gray-500 transition">
                        <input type="checkbox" checked={newCourt.lights} onChange={e => setNewCourt({ ...newCourt, lights: e.target.checked })} className="accent-purple-500" />
                        <span className="text-gray-300 text-xs">{t('rival.floodlights')}</span>
                    </label>
                    <button
                        type="button"
                        onClick={handleAddCourt}
                        disabled={isAddingCourt || !newCourt.name}
                        className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-2 rounded-xl text-sm disabled:opacity-50`}
                    >
                        {isAddingCourt ? t('rival.adding') : t('rival.add_select')}
                    </button>
                </div>
            )}


            {!form.flexibleSchedule && (
                form.venueId ? (
                    <div className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/30 rounded-xl px-4 py-3">
                        <span className="text-purple-300 text-xl flex-shrink-0">🏟️</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-bold truncate">{form.venueLabel}</p>
                            <p className="text-gray-400 text-xs">{vbDateLabel(form.venueBookingDate)} · {form.venueBookingStart}–{form.venueBookingEnd}{form.venueCourtPrice > 0 ? ` · ${form.venueCourtPrice}₺` : ''}</p>
                        </div>
                        <button type="button" onClick={clearVenueBooking} className="text-red-400 hover:text-red-300 text-xs font-bold flex-shrink-0">✕ {t('common.cancel')}</button>
                    </div>
                ) : (
                    <button type="button" onClick={() => setShowVenueSearch(true)}
                        className="w-full flex items-center justify-center gap-2 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 text-purple-300 font-bold py-2.5 rounded-xl text-sm transition">
                        🏟️ Tesis Ara ve Kort Rezerve Et
                    </button>
                )
            )}

            {!form.flexibleSchedule && !form.venueId && (
            <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
                <input
                    type="checkbox"
                    id="reserved"
                    checked={form.isCourtReserved}
                    onChange={e => setForm({ ...form, isCourtReserved: e.target.checked })}
                    className="w-4 h-4 accent-purple-500 cursor-pointer"
                />
                <label htmlFor="reserved" className="text-gray-300 text-sm cursor-pointer select-none">
                    {t('rival.court_reserved')}
                </label>
            </div>
            )}

            {showVenueSearch && (
                <VenueSearchModal sub={sub} config={config} initialName={venueSearchInitialName}
                    onClose={() => { setShowVenueSearch(false); setVenueSearchInitialName(''); }} onBooked={applyVenueBooking} />
            )}

            {COACH_EXPANDED_SPORTS.has(sub) && (
                <div className="bg-gray-800/60 border border-yellow-500/30 rounded-2xl p-4 space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={form.refereeRequested}
                            onChange={e => setForm(f => ({ ...f, refereeRequested: e.target.checked, ...(!e.target.checked && { refereeInvites: [] }) }))}
                            className="w-4 h-4 accent-yellow-500 cursor-pointer flex-shrink-0" />
                        <span className="text-white font-bold text-sm">🟨 {t('referees.request_referee')}</span>
                    </label>
                    {form.refereeRequested && (
                        <div className="space-y-3 pl-1">
                            <input value={form.refereePayment} onChange={e => setForm(f => ({ ...f, refereePayment: e.target.value }))}
                                placeholder={t('referees.referee_fee_ph')}
                                className="w-full bg-gray-800 text-white rounded-xl px-4 py-2 border border-gray-700 focus:outline-none focus:border-yellow-500 text-sm" />

                            <div>
                                <p className="text-gray-400 text-xs font-bold mb-1.5">{t('referees.invite_referee')} <span className="text-gray-600">({t('coaches.about_optional')})</span></p>
                                {form.refereeInvites.length > 0 && (
                                    <div className="space-y-1.5 mb-2">
                                        {form.refereeInvites.map(inv => (
                                            <div key={inv.userId} className="flex items-center gap-2 bg-gray-700/50 rounded-lg px-3 py-1.5">
                                                <span className="text-white text-xs font-bold flex-1 truncate">@{inv.username}</span>
                                                {inv.price && <span className="text-yellow-400 text-xs font-bold">{inv.price}₺</span>}
                                                <button type="button" onClick={() => removeRefereeInvite(inv.userId)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {!refInviteDraft ? (
                                    <div className="flex gap-2 items-center">
                                        <input value={refInviteSearchQ}
                                            onChange={e => { setRefInviteSearchQ(e.target.value); searchRefereeInvitees(e.target.value); }}
                                            placeholder={t('referees.search_referee_ph')}
                                            className="flex-1 bg-gray-700 text-white rounded-xl px-3 py-2 border border-gray-600 focus:outline-none focus:border-yellow-500 text-xs" />
                                        {refInviteSearchLoading && <span className="text-gray-400 text-xs">...</span>}
                                    </div>
                                ) : (
                                    <div className="bg-gray-700/60 rounded-xl p-3 space-y-2 border border-yellow-500/30">
                                        <p className="text-white text-xs font-bold">@{refInviteDraft.username}</p>
                                        <input value={refInviteDraft.price} onChange={e => setRefInviteDraft(d => ({ ...d, price: e.target.value.replace(/[^0-9]/g, '') }))}
                                            placeholder={t('referees.invite_price_ph')} inputMode="numeric"
                                            className="w-full bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none text-xs" />
                                        <input value={refInviteDraft.message} onChange={e => setRefInviteDraft(d => ({ ...d, message: e.target.value }))}
                                            placeholder={t('referees.invite_msg_ph')}
                                            className="w-full bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none text-xs" />
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setRefInviteDraft(null)} className="flex-1 bg-gray-800 text-gray-300 text-xs font-bold py-1.5 rounded-lg">{t('common.cancel')}</button>
                                            <button type="button" onClick={confirmRefereeInvite} className={`flex-1 bg-gradient-to-r ${config.color} text-white text-xs font-bold py-1.5 rounded-lg`}>{t('common.confirm')}</button>
                                        </div>
                                    </div>
                                )}
                                {refInviteSearchResults.length > 0 && !refInviteDraft && (
                                    <div className="bg-gray-700 rounded-xl border border-gray-600 overflow-hidden mt-1.5">
                                        {refInviteSearchResults.slice(0, 5).map(u => (
                                            <button key={u.id} type="button"
                                                onClick={() => { setRefInviteDraft({ id: u.id, username: u.username, fullName: u.fullName, price: '', message: '' }); setRefInviteSearchResults([]); setRefInviteSearchQ(''); }}
                                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-600 transition text-left border-b border-gray-600/50 last:border-0">
                                                <span className="text-white text-xs font-bold flex-1 truncate">{u.fullName || u.username}</span>
                                                <span className="text-gray-500 text-[10px]">@{u.username}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {(isCompetitiveTeam || needsPartner) && spotsLeft > 0 && (
                <p className="text-red-400 text-xs text-center font-bold">
                    {needsPartner ? t('rival.choose_partner_warn') : t('rival.fill_spots', { n: form.teamSize })}
                </p>
            )}
            {validationError && (
                <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    ⚠️ {validationError}
                </p>
            )}
            <button
                type="submit"
                disabled={isSubmitting || (!form.flexibleSchedule && (isCompetitiveTeam || needsPartner) && spotsLeft > 0)}
                className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50 transition hover:opacity-90`}
            >
                {isSubmitting ? t('rival.posting') : t('rival.post_request')}
            </button>
        </form>
    );
}

// Team Challenge Modal — opponent builds their team before sending a join request
function TeamChallengeModal({ config, sub, categoryUpper, rival, myId, myInterest, onClose, onSent }) {
    const { t } = useTranslation();
    const [joiningTeam, setJoiningTeam] = useState([]);
    const [searchQ, setSearchQ] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);

    const spotsLeft = rival.teamSize - 1 - joiningTeam.length;
    const isFull = joiningTeam.length >= rival.teamSize - 1;

    const teamAvgRating = (() => {
        const myRating = myInterest?.skillRating || 0;
        const all = [myRating, ...joiningTeam.map(t => t.skillRating)];
        return (all.reduce((s, r) => s + r, 0) / all.length).toFixed(2);
    })();

    const searchPlayers = async (q) => {
        if (q.length < 2) { setSearchResults([]); return; }
        setSearchLoading(true);
        try {
            const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}&subCategory=${sub}&category=${categoryUpper}`);
            setSearchResults(data.filter(u => u.id !== myId && !joiningTeam.some(t => t.id === u.id)));
        } catch {} finally { setSearchLoading(false); }
    };

    const addPlayer = (user) => {
        if (joiningTeam.length >= rival.teamSize - 1) return;
        const interest = (user.interests || []).find(i => i.subCategory === sub);
        setJoiningTeam(prev => [...prev, { id: user.id, username: user.username, fullName: user.fullName, skillRating: interest?.skillRating || 0, assessmentCompleted: interest?.assessmentCompleted || false }]);
        setSearchResults([]);
        setSearchQ('');
    };

    const handleSend = async () => {
        setIsSending(true);
        try {
            // Build full joining team: self + added players
            const myEntry = { id: myId, username: myInterest?.username || '', fullName: '', skillRating: myInterest?.skillRating || 0 };
            const fullTeam = [myEntry, ...joiningTeam];
            await api.post(`/rivals/${rival.id}/respond`, { joiningTeam: fullTeam });
            onSent();
            onClose();
        } catch (err) {
            alert(err.response?.data?.message || 'Error');
        } finally {
            setIsSending(false);
        }
    };

    const senderTeam = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
    const senderAvg = senderTeam.length > 0
        ? ((rival.sender?.interests?.[0]?.skillRating || 0) + senderTeam.reduce((s, t) => s + (t.skillRating || 0), 0)) / (senderTeam.length + 1)
        : (rival.sender?.interests?.[0]?.skillRating || 0);

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center px-5 py-4 border-b border-gray-800 flex-shrink-0">
                    <div>
                        <h3 className="text-white font-bold">⚔️ {t('rival.build_team')}</h3>
                        <p className="text-gray-500 text-xs mt-0.5">{rival.teamSize}v{rival.teamSize} · Competitive</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {/* Opponent team preview */}
                    <div className="bg-gray-800/60 rounded-xl p-3">
                        <p className="text-gray-400 text-xs font-bold mb-2">📋 {rival.sender?.username}'s Team</p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gray-300 text-xs bg-gray-700 rounded-full px-2 py-0.5">{rival.sender?.username} ★</span>
                            {senderTeam.map(t => (
                                <span key={t.id} className="text-gray-400 text-xs bg-gray-700/60 rounded-full px-2 py-0.5">{t.username}</span>
                            ))}
                        </div>
                        <p className={`text-xs font-bold mt-1.5 bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                            Avg: {senderAvg.toFixed(2)}★
                        </p>
                    </div>

                    {/* Your team */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-white text-sm font-bold">Your Team</p>
                            <p className={`text-sm font-black bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                {teamAvgRating}★ avg · {joiningTeam.length + 1}/{rival.teamSize}
                            </p>
                        </div>

                        <div className="space-y-1.5 mb-3">
                            {/* Self */}
                            <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
                                <div className={`w-6 h-6 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[10px] font-bold`}>★</div>
                                <p className="text-white text-xs font-bold flex-1">{t('rival.you_captain')}</p>
                                {myInterest?.assessmentCompleted && (
                                    <span className={`text-[10px] font-black bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                        {Number(myInterest.skillRating).toFixed(2)}★
                                    </span>
                                )}
                            </div>
                            {joiningTeam.map(t => (
                                <div key={t.id} className="flex items-center gap-2 bg-gray-800/60 rounded-xl px-3 py-2">
                                    <div className={`w-6 h-6 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[10px] font-bold`}>
                                        {t.username?.[0]?.toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-xs font-bold truncate">{t.fullName || t.username}</p>
                                        <p className="text-gray-500 text-[10px]">@{t.username}</p>
                                    </div>
                                    {t.assessmentCompleted && (
                                        <span className={`text-[10px] font-black bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                            {Number(t.skillRating).toFixed(2)}★
                                        </span>
                                    )}
                                    <button onClick={() => setJoiningTeam(prev => prev.filter(p => p.id !== t.id))}
                                        className="text-red-400 hover:text-red-300 text-xs ml-1">✕</button>
                                </div>
                            ))}
                        </div>

                        {spotsLeft > 0 && (
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <input
                                        value={searchQ}
                                        onChange={e => { setSearchQ(e.target.value); searchPlayers(e.target.value); }}
                                        placeholder={spotsLeft > 1 ? t('rival.search_players', { n: spotsLeft }) : t('rival.search_player', { n: spotsLeft })}
                                        className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-2 border border-gray-700 focus:outline-none focus:border-green-500 text-xs"
                                    />
                                    {searchLoading && <span className="text-gray-400 text-xs self-center">...</span>}
                                </div>
                                {searchResults.length > 0 && (
                                    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                                        {searchResults.slice(0, 5).map(u => {
                                            const interest = (u.interests || []).find(i => i.subCategory === sub);
                                            return (
                                                <button key={u.id} onClick={() => addPlayer(u)}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-700 transition text-left border-b border-gray-700/50 last:border-0">
                                                    <div className={`w-7 h-7 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                                        {u.username?.[0]?.toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-xs font-bold truncate">{u.fullName || u.username}</p>
                                                        <p className="text-gray-500 text-[10px]">@{u.username}</p>
                                                    </div>
                                                    {interest?.assessmentCompleted ? (
                                                        <span className={`text-[10px] font-black bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                                            {Number(interest.skillRating).toFixed(2)}★
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-600 text-[10px]">{t('rival.no_rating')}</span>
                                                    )}
                                                    <span className="text-green-400 text-xs">{t('rival.add_player')}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                        {isFull && <p className="text-green-400 text-xs text-center font-bold">{t('rival.team_full')}</p>}
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-gray-800 flex gap-3 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl text-sm border border-gray-700 hover:bg-gray-700 transition">
                        {t('rival.cancel')}
                    </button>
                    <button onClick={handleSend} disabled={isSending || !isFull}
                        className={`flex-1 bg-gradient-to-r ${config.color} text-white font-bold py-2.5 rounded-xl text-sm hover:opacity-90 transition disabled:opacity-40`}>
                        {isSending ? t('rival.posting') : `⚔️ ${t('rival.join')} (${joiningTeam.length + 1}/${rival.teamSize})`}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Player Wanted Tab — volleyball: looking for individual players for a match
function PlayerWantedTab({ config, categoryUpper, sub, myId, posts, setPosts, onMatchFull }) {
    const { t } = useTranslation();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm]         = useState({
        surface: sub === 'football' ? 'HALI_SAHA' : 'BEACH',
        teamSize: sub === 'football' ? 5 : 2,
        playersNeeded: 1,
        positions: [],          // array of 'ANY' | 'GOALKEEPER' | 'REFEREE' (multi when playersNeeded > 1)
        positionCounts: { ANY: 1, GOALKEEPER: 1 },  // REFEREE is always 1, excluded from player limit
        gkPayment: 'FREE',      // 'FREE' | 'PAID'
        refereePayment: '',     // free-text fee description for referee
        location: '',
        courtName: '',
        courtAddress: '',
        matchDate: '',
        matchTime: '',
        duration: '',
        message: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [teamMembers, setTeamMembers] = useState([]);   // optional display: [{username}]
    const [teamInput, setTeamInput]     = useState('');
    const [showTeamSection, setShowTeamSection] = useState(false);

    // posts/setPosts come from parent (SubCategoryPage) — no local fetch needed

    const handlePost = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const { data } = await api.post('/rivals', {
                category: categoryUpper,
                subCategory: sub,
                matchType: 'PLAYER_WANTED',
                surface: form.surface,
                teamSize: form.teamSize,
                message: [
                    form.message,
                    form.positions.includes('ANY')        ? `⚽ ${form.positionCounts.ANY} regular player${form.positionCounts.ANY > 1 ? 's' : ''} wanted` : '',
                    form.positions.includes('GOALKEEPER') ? `🧤 ${form.positionCounts.GOALKEEPER} goalkeeper${form.positionCounts.GOALKEEPER > 1 ? 's' : ''} wanted · ${form.gkPayment === 'FREE' ? 'Plays free' : 'Paid by team'}` : '',
                    form.positions.includes('REFEREE')    ? `🟨 Referee wanted${form.refereePayment ? ` · Fee: ${form.refereePayment}` : ''}` : '',
                ].filter(Boolean).join('\n'),
                location: form.location,
                courtName: form.courtName || null,
                courtAddress: form.courtAddress || null,
                matchDate: form.matchDate || null,
                matchTime: form.matchTime || null,
                level: 'BEGINNER',
                levelDetail: String(form.playersNeeded),
                ...(form.duration && { duration: Number(form.duration) }),
                ...(teamMembers.length > 0 && { senderTeam: teamMembers }),
            });
            setPosts(prev => [data, ...prev]);
            setForm({ surface: sub === 'football' ? 'HALI_SAHA' : 'BEACH', teamSize: sub === 'football' ? 5 : 2, playersNeeded: 1, positions: [], positionCounts: { ANY: 1, GOALKEEPER: 1 }, gkPayment: 'FREE', refereePayment: '', location: '', courtName: '', courtAddress: '', matchDate: '', matchTime: '', duration: '', message: '' });
            setTeamMembers([]);
            setTeamInput('');
            setShowTeamSection(false);
            setShowForm(false);
        } catch (err) { console.error(err); }
        finally { setIsSubmitting(false); }
    };

    const [isDemoLoading, setIsDemoLoading] = useState(false);

    const handleJoin = async (rivalId) => {
        try {
            const { data } = await api.post(`/rivals/${rivalId}/respond`);
            alert(data.message);
        } catch (err) { alert(err.response?.data?.message || 'Error'); }
    };

    const handleDemoRequests = async () => {
        setIsDemoLoading(true);
        try {
            const { data } = await api.post('/demo/football-join');
            // Merge updated posts (with demo join requests) into state
            setPosts(prev => prev.map(p => {
                const updated = data.posts.find(u => u.id === p.id);
                return updated ? { ...p, joinRequests: updated.joinRequests } : p;
            }));
            alert(`${data.message} Sayfayı yenileyin veya istekleri görüntüleyin.`);
        } catch (err) {
            alert(err.response?.data?.message || 'Demo isteği gönderilemedi.');
        } finally {
            setIsDemoLoading(false);
        }
    };

    const myOpenPosts = posts.filter(p => p.senderId === myId && p.status === 'OPEN');

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-white font-bold">👤 Player Wanted</h3>
                <div className="flex gap-2">
                    {sub === 'football' && myOpenPosts.length > 0 && (
                        <button onClick={handleDemoRequests} disabled={isDemoLoading}
                            className="bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold px-3 py-2 rounded-xl text-xs disabled:opacity-50 transition">
                            {isDemoLoading ? '⏳' : '🎭 Demo'}
                        </button>
                    )}
                    <button onClick={() => setShowForm(v => !v)}
                        className={`bg-gradient-to-r ${config.color} text-white font-bold px-4 py-2 rounded-xl text-sm`}>
                        {showForm ? '✕ Close' : '+ Post Ad'}
                    </button>
                </div>
            </div>

            {showForm && (
                <form onSubmit={handlePost} className={`${config.bg} border ${config.border} rounded-2xl p-5 space-y-4`}>
                    <h4 className="text-white font-bold">🏐 Looking for Players</h4>

                    {/* Surface */}
                    <div>
                        <label className="text-gray-400 text-xs mb-2 block">
                            {sub === 'football' ? 'Field Type' : 'Court Type'}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {(sub === 'football' ? FOOTBALL_SURFACES : VOLLEYBALL_SURFACES).map(s => (
                                <button key={s.id} type="button"
                                    onClick={() => setForm(f => ({ ...f, surface: s.id }))}
                                    className={`flex flex-col items-center py-2.5 rounded-xl border font-bold text-xs transition ${form.surface === s.id ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                                    <span className="text-xl mb-0.5">{s.emoji}</span>
                                    <span className="text-center leading-tight">{t(s.tKey)}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Match format & players needed */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-gray-400 text-xs mb-2 block">Match Format</label>
                            <div className="grid grid-cols-3 gap-1">
                                {(sub === 'football' ? FOOTBALL_SIZES : VOLLEYBALL_SIZES).map(n => (
                                    <button key={n} type="button"
                                        onClick={() => setForm(f => ({ ...f, teamSize: n }))}
                                        className={`py-2 rounded-lg border font-black text-xs transition ${form.teamSize === n ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                                        {n}v{n}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs mb-2 block">Players Needed</label>
                            <div className="grid grid-cols-3 gap-1">
                                {[1, 2, 3, 4, 5, 6].map(n => (
                                    <button key={n} type="button"
                                        onClick={() => setForm(f => ({
                                            ...f,
                                            playersNeeded: n,
                                            // going back to single: keep at most one selected position
                                            ...(n === 1 && f.positions.length > 1 ? { positions: [] } : {}),
                                        }))}
                                        className={`py-2 rounded-lg border font-black text-xs transition ${form.playersNeeded === n ? 'bg-purple-600 text-white border-transparent' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-gray-400 text-xs mb-1 block">📅 Date</label>
                            <input type="date" onClick={e => e.target.showPicker?.()} value={form.matchDate} onChange={e => setForm(f => ({...f, matchDate: e.target.value}))}
                                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 border border-gray-700 focus:outline-none text-sm" />
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs mb-1 block">🕐 Start Time</label>
                            <TimeSelect value={form.matchTime} onChange={v => setForm(f => ({...f, matchTime: v}))} className="w-full" />
                        </div>
                    </div>

                    {/* Duration */}
                    <div>
                        <label className="text-gray-400 text-xs mb-2 block">⏱️ Duration</label>
                        <div className="grid grid-cols-6 gap-1.5">
                            {DURATION_OPTIONS.map(d => (
                                <button key={d.value} type="button"
                                    onClick={() => setForm(f => ({...f, duration: f.duration === d.value ? '' : d.value}))}
                                    className={`py-2 rounded-xl border font-bold text-xs transition ${form.duration === d.value ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                                    {d.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Location — city first, then court name + address */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">📍 City</label>
                        <input value={form.location} onChange={e => setForm(f => ({...f, location: e.target.value}))}
                            placeholder="Enter city name"
                            className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm" />
                    </div>
                    {form.location && (
                        <>
                            <div>
                                <label className="text-gray-400 text-xs mb-1 block">🏟️ Court / Field Name</label>
                                <input value={form.courtName} onChange={e => setForm(f => ({...f, courtName: e.target.value}))}
                                    placeholder="e.g. City Sports Center, Beach Court..."
                                    className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm" />
                            </div>
                            <div>
                                <label className="text-gray-400 text-xs mb-1 block">📌 Address</label>
                                <input value={form.courtAddress} onChange={e => setForm(f => ({...f, courtAddress: e.target.value}))}
                                    placeholder="Street, district or full address..."
                                    className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm" />
                            </div>
                        </>
                    )}

                    {/* Position (football only) */}
                    {sub === 'football' && (
                        <div>
                            <label className="text-gray-400 text-xs mb-2 block">
                                {form.playersNeeded > 1 ? 'Special Positions Needed (optional, multi-select)' : 'Position Needed (optional)'}
                            </label>

                            {form.playersNeeded === 1 ? (
                                // Single select
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { id: '',           label: 'Any Player', emoji: '⚽' },
                                        { id: 'GOALKEEPER', label: 'Goalkeeper', emoji: '🧤' },
                                    ].map(pos => (
                                        <button key={pos.id || 'any'} type="button"
                                            onClick={() => setForm(f => ({ ...f, positions: pos.id === '' ? [] : [pos.id] }))}
                                            className={`flex flex-col items-center py-2.5 rounded-xl border font-bold text-xs transition ${
                                                (pos.id === '' ? form.positions.length === 0 : form.positions[0] === pos.id)
                                                    ? `bg-gradient-to-r ${config.color} text-white border-transparent`
                                                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                                            }`}>
                                            <span className="text-xl mb-0.5">{pos.emoji}</span>
                                            {pos.label}
                                        </button>
                                    ))}
                                </div>
                            ) : (() => {
                                // REFEREE is outside the player limit — only ANY + GOALKEEPER count
                                const playerTotal = form.positions
                                    .filter(pid => pid !== 'REFEREE')
                                    .reduce((sum, pid) => sum + (form.positionCounts[pid] || 1), 0);
                                const atLimit = playerTotal >= form.playersNeeded;
                                return (
                                    <div className="space-y-3">
                                        {/* Player positions — capped at playersNeeded */}
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'ANY',        label: 'Any Player', emoji: '⚽' },
                                                { id: 'GOALKEEPER', label: 'Goalkeeper', emoji: '🧤' },
                                            ].map(pos => {
                                                const isSelected = form.positions.includes(pos.id);
                                                const count = form.positionCounts[pos.id] || 1;
                                                const canAdd = !atLimit;
                                                const canSelect = isSelected || !atLimit;
                                                return (
                                                    <div key={pos.id} className={`flex flex-col rounded-xl border overflow-hidden transition ${isSelected ? 'border-transparent' : canSelect ? 'border-gray-700' : 'border-gray-800 opacity-50'}`}>
                                                        <button type="button" disabled={!canSelect}
                                                            onClick={() => setForm(f => ({
                                                                ...f,
                                                                positions: f.positions.includes(pos.id)
                                                                    ? f.positions.filter(p => p !== pos.id)
                                                                    : [...f.positions, pos.id],
                                                            }))}
                                                            className={`flex flex-col items-center py-2.5 font-bold text-xs transition w-full ${
                                                                isSelected
                                                                    ? `bg-gradient-to-r ${config.color} text-white`
                                                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-750 disabled:cursor-not-allowed'
                                                            }`}>
                                                            <span className="text-xl mb-0.5">{pos.emoji}</span>
                                                            {pos.label}
                                                        </button>
                                                        {isSelected && (
                                                            <div className="flex items-center justify-center gap-2 bg-gray-900 py-1.5">
                                                                <button type="button"
                                                                    onClick={() => setForm(f => ({ ...f, positionCounts: { ...f.positionCounts, [pos.id]: Math.max(1, (f.positionCounts[pos.id] || 1) - 1) } }))}
                                                                    className="w-5 h-5 rounded-full bg-gray-700 text-white text-xs font-bold flex items-center justify-center hover:bg-gray-600">
                                                                    −
                                                                </button>
                                                                <span className="text-white font-bold text-sm w-4 text-center">{count}</span>
                                                                <button type="button" disabled={!canAdd}
                                                                    onClick={() => setForm(f => ({ ...f, positionCounts: { ...f.positionCounts, [pos.id]: (f.positionCounts[pos.id] || 1) + 1 } }))}
                                                                    className="w-5 h-5 rounded-full bg-gray-700 text-white text-xs font-bold flex items-center justify-center hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed">
                                                                    +
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="text-center text-xs text-gray-500">
                                            {playerTotal} / {form.playersNeeded} player slots selected
                                        </div>

                                    </div>
                                );
                            })()}

                            {/* Goalkeeper payment options */}
                            {form.positions.includes('GOALKEEPER') && (
                                <div className="mt-3 space-y-2">
                                    <label className="text-gray-400 text-xs">🧤 Goalkeeper Payment</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button type="button"
                                            onClick={() => setForm(f => ({...f, gkPayment: 'FREE'}))}
                                            className={`py-2.5 rounded-xl border font-bold text-xs transition ${form.gkPayment === 'FREE' ? 'bg-green-600/20 border-green-500 text-green-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                                            ✅ Goalkeeper plays free
                                        </button>
                                        <button type="button"
                                            onClick={() => setForm(f => ({...f, gkPayment: 'PAID'}))}
                                            className={`py-2.5 rounded-xl border font-bold text-xs transition ${form.gkPayment === 'PAID' ? 'bg-yellow-600/20 border-yellow-500 text-yellow-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                                            💰 Team pays goalkeeper
                                        </button>
                                    </div>
                                    {form.gkPayment === 'PAID' && (
                                        <p className="text-yellow-400 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                                            💬 Payment amount will be agreed upon with the goalkeeper
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <textarea value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))}
                        placeholder="Extra details (position needed, level, etc.)" rows={2}
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none resize-none text-sm" />

                    {/* Optional: show team members on listing */}
                    <div className="border border-gray-700 rounded-xl overflow-hidden">
                        <button type="button" onClick={() => setShowTeamSection(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-800 text-sm text-gray-300 hover:text-white transition">
                            <span>👥 Show your team on listing <span className="text-gray-500 text-xs">(optional)</span></span>
                            <span className="text-gray-500 text-xs">{showTeamSection ? '▲ Hide' : '▼ Add'}</span>
                        </button>
                        {showTeamSection && (
                            <div className="p-3 space-y-2 bg-gray-800/50">
                                <div className="flex gap-2">
                                    <input
                                        value={teamInput}
                                        onChange={e => setTeamInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') { e.preventDefault(); if (teamInput.trim()) { setTeamMembers(prev => [...prev, { username: teamInput.trim() }]); setTeamInput(''); } }
                                        }}
                                        placeholder="Enter username and press Enter"
                                        className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-1.5 text-sm border border-gray-600 focus:outline-none focus:border-purple-500"
                                    />
                                    <button type="button"
                                        onClick={() => { if (teamInput.trim()) { setTeamMembers(prev => [...prev, { username: teamInput.trim() }]); setTeamInput(''); } }}
                                        className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition">
                                        + Add
                                    </button>
                                </div>
                                {teamMembers.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {teamMembers.map((m, i) => (
                                            <div key={i} className="flex items-center gap-1 bg-gray-700 rounded-full px-2.5 py-1">
                                                <div className={`w-4 h-4 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[9px] font-bold`}>
                                                    {m.username[0]?.toUpperCase()}
                                                </div>
                                                <span className="text-gray-200 text-xs">{m.username}</span>
                                                <button type="button" onClick={() => setTeamMembers(prev => prev.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400 ml-0.5 text-xs">✕</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <button type="submit" disabled={isSubmitting}
                        className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50`}>
                        {isSubmitting ? 'Posting...' : '👤 Post Player Wanted'}
                    </button>
                </form>
            )}

            {posts.length === 0 ? (
                <div className="text-center py-12 bg-gray-900 rounded-2xl border border-gray-800">
                    <p className="text-4xl mb-3">🏐</p>
                    <p className="text-gray-400">No player ads yet. Be the first!</p>
                </div>
            ) : (
                posts.map(post => {
                    const isOwn = post.senderId === myId;
                    const allSurfaces = [...VOLLEYBALL_SURFACES, ...FOOTBALL_SURFACES];
                    const surfaceInfo = allSurfaces.find(s => s.id === post.surface);
                    const surfaceEmoji = surfaceInfo?.emoji || '🏟️';
                    const surfaceLabel = surfaceInfo ? t(surfaceInfo.tKey) : (post.surface || '');
                    return (
                        <div key={post.id} className={`${config.bg} border ${config.border} rounded-2xl p-4`}>
                            <div className="flex items-start gap-3 mb-3">
                                <div className={`w-10 h-10 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white font-bold flex-shrink-0`}>
                                    {post.sender?.username?.[0]?.toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-bold">{post.sender?.fullName || post.sender?.username}</p>
                                    <p className="text-gray-400 text-xs">@{post.sender?.username}</p>
                                    {/* Sender's sport rating */}
                                    {(() => {
                                        const interest = (post.sender?.interests || [])[0];
                                        if (!interest || interest.totalPoints === 0) return null;
                                        const lvlColor =
                                            interest.level === 'PRO'          ? 'text-purple-400' :
                                            interest.level === 'ADVANCED'     ? 'text-orange-400' :
                                            interest.level === 'INTERMEDIATE' ? 'text-yellow-400' :
                                                                                'text-green-400';
                                        return (
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className={`font-black text-xs bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                                    {Number(interest.skillRating).toFixed(2)}★
                                                </span>
                                                <span className={`text-[10px] font-bold ${lvlColor}`}>{interest.level}</span>
                                                {(interest.wins > 0 || interest.losses > 0) && (
                                                    <span className="text-[10px] text-gray-500">{interest.wins}W–{interest.losses}L</span>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold bg-gradient-to-r ${config.color} text-white`}>
                                        {surfaceEmoji} {surfaceLabel} · {post.teamSize}v{post.teamSize}
                                    </span>
                                    {(() => {
                                        const total   = Number(post.levelDetail) || 0;
                                        const joined  = Array.isArray(post.participants) ? post.participants.length : 0;
                                        const remaining = Math.max(0, total - joined);
                                        if (total === 0) return <span className="text-purple-400 text-xs font-bold">👤 Looking for players</span>;
                                        if (remaining === 0) return <span className="text-green-400 text-xs font-bold">✅ Full ({total}/{total})</span>;
                                        return (
                                            <span className={`text-xs font-bold ${remaining > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                                                👤 {remaining} more needed ({joined}/{total})
                                            </span>
                                        );
                                    })()}
                                </div>
                            </div>

                            {post.message && <p className="text-gray-200 text-sm mb-3">{post.message}</p>}

                            {/* Date / Time / Duration — shown prominently */}
                            {(post.matchDate || post.matchTime || post.duration) && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {post.matchDate && (
                                        <span className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white font-semibold">
                                            📅 {new Date(post.matchDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
                                        </span>
                                    )}
                                    {post.matchTime && (
                                        <span className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white font-semibold">
                                            🕐 {post.matchTime}
                                        </span>
                                    )}
                                    {post.duration && (
                                        <span className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white font-semibold">
                                            ⏱️ {DURATION_OPTIONS.find(d=>d.value===String(post.duration))?.label || post.duration+' min'}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Sender's existing team members (optional display) */}
                            {Array.isArray(post.senderTeam) && post.senderTeam.length > 0 && (
                                <div className="mb-3">
                                    <p className="text-gray-500 text-xs font-bold mb-1.5">👥 Our team so far:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {/* Creator first */}
                                        <div className={`flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-full px-2.5 py-1`}>
                                            <div className={`w-4 h-4 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[9px] font-bold`}>
                                                {post.sender?.username?.[0]?.toUpperCase()}
                                            </div>
                                            <span className="text-gray-200 text-xs font-semibold">{post.sender?.username}</span>
                                            <span className="text-gray-500 text-[10px]">captain</span>
                                        </div>
                                        {post.senderTeam.map((m, i) => (
                                            <div key={m.id || i} className={`flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-full px-2.5 py-1`}>
                                                <div className={`w-4 h-4 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[9px] font-bold`}>
                                                    {m.username?.[0]?.toUpperCase()}
                                                </div>
                                                <span className="text-gray-200 text-xs">{m.username}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Accepted participants */}
                            {Array.isArray(post.participants) && post.participants.length > 0 && (
                                <div className="flex items-center gap-2 mb-3 flex-wrap">
                                    <span className="text-gray-500 text-xs font-bold">✅ Joined:</span>
                                    {post.participants.map(p => (
                                        <div key={p.id} className={`flex items-center gap-1 bg-green-900/30 border border-green-700/40 rounded-full px-2 py-0.5`}>
                                            <div className={`w-4 h-4 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[9px] font-bold`}>
                                                {p.username?.[0]?.toUpperCase()}
                                            </div>
                                            <span className="text-gray-300 text-xs">{p.username}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Location block */}
                            {(post.location || post.courtName || post.courtAddress) && (
                                <div className="bg-gray-800/60 border border-gray-700 rounded-xl px-3 py-2.5 mb-3 space-y-0.5">
                                    {post.location    && <p className="text-gray-300 text-xs font-bold">📍 {post.location}</p>}
                                    {post.courtName   && <p className="text-white text-xs font-bold">🏟️ {post.courtName}</p>}
                                    {post.courtAddress && <p className="text-gray-400 text-[10px]">{post.courtAddress}</p>}
                                </div>
                            )}

                            {isOwn ? (
                                <div className="space-y-2">
                                    {/* Pending join requests */}
                                    {(post.joinRequests || []).length > 0 && (
                                        <div className="bg-gray-800 rounded-xl p-3 space-y-2">
                                            <p className="text-gray-400 text-xs font-bold">
                                                📬 Requests ({post.joinRequests.length})
                                            </p>
                                            {post.joinRequests.map(jr => (
                                                <div key={jr.id} className="flex items-center gap-2">
                                                    <div className={`w-7 h-7 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                                        {jr.user?.username?.[0]?.toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-xs font-bold truncate">{jr.user?.fullName || jr.user?.username}</p>
                                                        <p className="text-gray-500 text-[10px]">@{jr.user?.username}</p>
                                                        {/* Sport rating */}
                                                        {(() => {
                                                            const interest = (jr.user?.interests || []).find(i =>
                                                                (!i.category || i.category === categoryUpper) && i.subCategory === sub
                                                            );
                                                            if (!interest || interest.totalPoints === 0) return null;
                                                            const lvlColor =
                                                                interest.level === 'PRO'          ? 'bg-purple-500/20 text-purple-400' :
                                                                interest.level === 'ADVANCED'     ? 'bg-orange-500/20 text-orange-400' :
                                                                interest.level === 'INTERMEDIATE' ? 'bg-yellow-500/20 text-yellow-400' :
                                                                                                    'bg-green-500/20 text-green-400';
                                                            return (
                                                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                                                    {interest.skillRating > 0 && (
                                                                        <span className={`font-black text-[10px] bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                                                            {Number(interest.skillRating).toFixed(2)}★
                                                                        </span>
                                                                    )}
                                                                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full ${lvlColor}`}>
                                                                        {interest.level}
                                                                    </span>
                                                                    {(interest.wins > 0 || interest.losses > 0) && (
                                                                        <span className="text-[9px] text-gray-500">
                                                                            {interest.wins}W–{interest.losses}L
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            const { data } = await api.patch(`/rivals/join/${jr.id}`, { action: 'accept' });
                                                            const isNowFull = data.matched || data.request?.status === 'MATCHED';
                                                            if (isNowFull) {
                                                                onMatchFull(data.request);
                                                            } else {
                                                                setPosts(prev => prev.map(p => {
                                                                    if (p.id !== post.id) return p;
                                                                    const newParticipants = [...(p.participants || []), { id: jr.user.id, username: jr.user.username, fullName: jr.user.fullName }];
                                                                    return {
                                                                        ...p,
                                                                        participants: newParticipants,
                                                                        joinRequests: (p.joinRequests||[]).filter(r => r.id !== jr.id),
                                                                    };
                                                                }));
                                                            }
                                                        }}
                                                        className="bg-green-600/80 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                                                    >
                                                        ✓ Accept
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            await api.patch(`/rivals/join/${jr.id}`, { action: 'reject' });
                                                            setPosts(prev => prev.map(p => p.id === post.id ? { ...p, joinRequests: (p.joinRequests||[]).filter(r => r.id !== jr.id) } : p));
                                                        }}
                                                        className="bg-gray-700 hover:bg-red-600/40 text-gray-300 hover:text-red-400 text-xs font-bold px-2 py-1.5 rounded-lg transition"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="bg-gray-800 border border-gray-700 text-gray-400 text-xs font-bold py-2 rounded-xl text-center">
                                        📋 Your Ad
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => handleJoin(post.id)}
                                    className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-2.5 rounded-xl text-sm hover:opacity-90 transition`}>
                                    ✋ I Want to Play
                                </button>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}

// Wellness Events Tab
function WellnessEventsTab({ config, sub, categoryUpper }) {
    const [events, setEvents] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ type: 'yoga', title: '', description: '', date: '', time: '', location: '', maxAttendees: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        api.get(`/posts?category=${categoryUpper}&subCategory=${sub}&type=POST&communityOnly=true&limit=30`)
            .then(({ data }) => setEvents(data))
            .catch(() => {});
    }, [sub, categoryUpper]);

    const WELLNESS_TYPES = [
        { id: 'yoga',     label: 'Yoga',     emoji: '🧘', color: 'from-teal-500 to-cyan-400' },
        { id: 'pilates',  label: 'Pilates',  emoji: '🤸', color: 'from-pink-400 to-purple-400' },
        { id: 'reformer', label: 'Reformer', emoji: '🏋️', color: 'from-indigo-400 to-blue-400' },
    ];

    const handleCreate = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const typeLabel = WELLNESS_TYPES.find(t => t.id === form.type);
            const content = [
                `${typeLabel?.emoji || '🧘'} [${typeLabel?.label || 'Wellness'}] ${form.title}`,
                form.description,
                form.date && `📅 ${form.date}${form.time ? ` 🕐 ${form.time}` : ''}`,
                form.location && `📍 ${form.location}`,
                form.maxAttendees && `👥 Max ${form.maxAttendees} attendees`,
            ].filter(Boolean).join('\n');

            const { data } = await api.post('/posts', {
                type: 'POST',
                content,
                category: categoryUpper,
                subCategory: sub,
            });
            setEvents(prev => [data, ...prev]);
            setForm({ type: form.type, title: '', description: '', date: '', time: '', location: '', maxAttendees: '' });
            setShowForm(false);
        } catch (err) { console.error(err); }
        finally { setIsSubmitting(false); }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-white font-bold">📅 Events & Classes</h3>
                <button onClick={() => setShowForm(v => !v)}
                    className={`bg-gradient-to-r ${config.color} text-white font-bold px-4 py-2 rounded-xl text-sm`}>
                    {showForm ? '✕ Close' : '+ Create Event'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleCreate} className={`${config.bg} border ${config.border} rounded-2xl p-5 space-y-3`}>
                    <h4 className="text-white font-bold">🌿 New Event / Class</h4>

                    {/* Wellness type selector */}
                    <div className="grid grid-cols-3 gap-2">
                        {WELLNESS_TYPES.map(t => (
                            <button key={t.id} type="button"
                                onClick={() => setForm(f => ({ ...f, type: t.id }))}
                                className={`flex flex-col items-center py-2.5 rounded-xl border font-bold text-xs transition ${
                                    form.type === t.id
                                        ? `bg-gradient-to-r ${t.color} text-white border-transparent`
                                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                                }`}>
                                <span className="text-xl mb-0.5">{t.emoji}</span>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                        placeholder="Event title *" required
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-teal-500 text-sm" />
                    <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                        placeholder="Description..." rows={2}
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-teal-500 resize-none text-sm" />
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-gray-400 text-xs mb-1 block">📅 Date</label>
                            <input type="date" onClick={e => e.target.showPicker?.()} value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                                className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 border border-gray-700 focus:outline-none text-sm" />
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs mb-1 block">🕐 Start Time</label>
                            <TimeSelect value={form.time} onChange={v => setForm({...form, time: v})} className="w-full" />
                        </div>
                    </div>
                    <input value={form.location} onChange={e => setForm({...form, location: e.target.value})}
                        placeholder="📍 Location / Studio"
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2 border border-gray-700 focus:outline-none text-sm" />
                    <input type="number" value={form.maxAttendees} onChange={e => setForm({...form, maxAttendees: e.target.value})}
                        placeholder="👥 Max attendees (optional)"
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2 border border-gray-700 focus:outline-none text-sm" />
                    <button type="submit" disabled={isSubmitting || !form.title}
                        className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50`}>
                        {isSubmitting ? 'Creating...' : '🌿 Create Event'}
                    </button>
                </form>
            )}

            {events.length === 0 ? (
                <div className="text-center py-12 bg-gray-900 rounded-2xl border border-gray-800">
                    <p className="text-4xl mb-3">🧘</p>
                    <p className="text-gray-400">No events yet. Be the first to organize one!</p>
                </div>
            ) : (
                events.map(ev => (
                    <div key={ev.id} className={`${config.bg} border ${config.border} rounded-2xl p-4`}>
                        <div className="flex items-center gap-2 mb-3">
                            <div className={`w-8 h-8 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                {ev.user?.username?.[0]?.toUpperCase()}
                            </div>
                            <div>
                                <p className="text-white text-sm font-bold">{ev.user?.fullName || ev.user?.username}</p>
                                <p className="text-gray-500 text-xs">{new Date(ev.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                            </div>
                        </div>
                        {/* Type badge from content prefix */}
                        {(() => {
                            const match = ev.content?.match(/^[🧘🤸🏋️]+\s*\[(\w+)\]/);
                            if (match) {
                                const t = WELLNESS_TYPES.find(x => x.id === match[1].toLowerCase());
                                if (t) return (
                                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full mb-2 bg-gradient-to-r ${t.color} text-white`}>
                                        {t.emoji} {t.label}
                                    </span>
                                );
                            }
                            return null;
                        })()}
                        <p className="text-gray-200 text-sm whitespace-pre-line">{ev.content?.replace(/^[🧘🤸🏋️]+\s*\[\w+\]\s*/, '')}</p>
                    </div>
                ))
            )}
        </div>
    );
}

// Reusable score display
function ScoreDisplay({ score, match, participants, config }) {
    const sets = score.sets || [];
    const isFootball = match.subCategory === 'football' || match.subCategory === 'basketball';
    const senderName   = match.sender?.username || 'Player 1';
    const opponentName = participants[0]?.username || 'Player 2';
    const isWinnerSender = score.winner === 'sender';
    const winnerName   = isWinnerSender ? senderName   : opponentName;
    const loserName    = isWinnerSender ? opponentName : senderName;

    if (isFootball) {
        const s0 = sets[0] || {};
        const senderGoals   = Number(s0.sender   ?? 0);
        const opponentGoals = Number(s0.opponent ?? 0);
        const isDraw = score.winner === 'draw';
        const leftWin  = !isDraw && isWinnerSender;
        const rightWin = !isDraw && !isWinnerSender;

        // Build full team rosters
        const senderExtraTeam = Array.isArray(match.senderTeam) ? match.senderTeam : [];
        const leftTeam  = [{ id: match.senderId, username: senderName }, ...senderExtraTeam];
        const rightTeam = participants.length > 0 ? participants : [{ username: opponentName }];
        const isTeamMatch = senderExtraTeam.length > 0 || participants.length > 1;

        const TeamCol = ({ team, isWin, isDraw, align }) => (
            <div className={`flex flex-col gap-1.5 min-w-0 ${align === 'right' ? 'items-end' : 'items-start'}`}>
                {team.map((p, i) => (
                    <div key={p.id || i} className={`flex items-center gap-1.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 ${isWin ? 'bg-green-600' : isDraw ? 'bg-gray-600' : 'bg-gray-700'}`}>
                            {p.username?.[0]?.toUpperCase()}
                        </div>
                        <span className={`text-xs font-bold truncate max-w-[70px] ${isWin ? 'text-green-300' : isDraw ? 'text-gray-300' : 'text-gray-500'}`}>
                            {p.username}
                        </span>
                    </div>
                ))}
                <span className={`text-[9px] font-black tracking-widest uppercase mt-0.5 ${isWin ? 'text-green-400' : isDraw ? 'text-yellow-500' : 'text-gray-600'}`}>
                    {isWin ? '🏆 WIN' : isDraw ? 'DRAW' : 'LOSS'}
                </span>
            </div>
        );

        return (
            <div className="rounded-2xl border border-gray-700 mt-2 overflow-hidden" style={{ background: 'rgba(17,24,39,0.8)' }}>
                <div className="flex items-center px-3 py-3 gap-2">
                    {/* Left team */}
                    <div className="flex-1 min-w-0">
                        <TeamCol team={leftTeam} isWin={leftWin} isDraw={isDraw} align="left" />
                    </div>
                    {/* Score */}
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0 px-2">
                        <div className="flex items-center gap-1.5">
                            <span className={`font-black text-4xl leading-none tabular-nums ${leftWin ? 'text-green-300' : 'text-gray-200'}`}>{senderGoals}</span>
                            <span className="text-gray-600 font-black text-2xl leading-none">–</span>
                            <span className={`font-black text-4xl leading-none tabular-nums ${rightWin ? 'text-green-300' : 'text-gray-200'}`}>{opponentGoals}</span>
                        </div>
                        <span className="text-gray-600 text-[9px] font-bold tracking-widest uppercase">
                            {isDraw ? 'Full Time' : 'Final'}
                        </span>
                    </div>
                    {/* Right team */}
                    <div className="flex-1 min-w-0 flex justify-end">
                        <TeamCol team={rightTeam} isWin={rightWin} isDraw={isDraw} align="right" />
                    </div>
                </div>
            </div>
        );
    }

    // Set-based sports (tennis, padel, etc.)
    const winnerSets = sets.map(s => isWinnerSender ? Number(s.sender) : Number(s.opponent));
    const loserSets  = sets.map(s => isWinnerSender ? Number(s.opponent) : Number(s.sender));
    const totalWinner = winnerSets.filter((w, i) => w > loserSets[i]).length;
    const totalLoser  = loserSets.filter((l, i) => l > winnerSets[i]).length;

    return (
        <div className="rounded-xl overflow-hidden border border-gray-700 mt-2">
            <div className={`flex items-center gap-3 px-4 py-3`} style={{ background: 'rgba(34,197,94,0.12)' }}>
                <span className="text-yellow-400 text-base flex-shrink-0">🏆</span>
                <span className="text-green-300 font-black text-sm flex-1 truncate">{winnerName}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {winnerSets.map((w, i) => (
                        <span key={i} className="text-green-300 font-black text-base w-6 text-center">{w}</span>
                    ))}
                </div>
                <span className="text-green-400 font-black text-xl w-6 text-center flex-shrink-0">{totalWinner}</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-1 bg-gray-800/60 border-y border-gray-700">
                <span className="flex-1" />
                {sets.map((_, i) => (
                    <span key={i} className="text-gray-600 text-[9px] font-bold w-6 text-center">S{i+1}</span>
                ))}
                <span className="text-gray-600 text-[9px] font-bold w-6 text-center">TOT</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-800/40">
                <span className="text-gray-600 text-base flex-shrink-0">  </span>
                <span className="text-gray-400 font-bold text-sm flex-1 truncate">{loserName}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {loserSets.map((l, i) => (
                        <span key={i} className="text-gray-400 font-bold text-base w-6 text-center">{l}</span>
                    ))}
                </div>
                <span className="text-gray-500 font-bold text-xl w-6 text-center flex-shrink-0">{totalLoser}</span>
            </div>
        </div>
    );
}

// Score entry modal — football: single scoreline; others: set-based
function ScoreModal({ match, config, myId, onClose, onSave }) {
    const participants  = Array.isArray(match.participants) ? match.participants : [];
    const isFootball    = match.subCategory === 'football' || match.subCategory === 'basketball';
    const isCompetitive = match.matchMode === 'COMPETITIVE';

    // Team labels
    const senderLabel   = match.sender?.username || 'Team A';
    const opponentLabel = participants[0]?.username || 'Team B';

    // ── Football / basketball: single score ──────────────────────────────────
    const [senderGoals,   setSenderGoals]   = useState(match.score?.sets?.[0]?.sender   ?? '');
    const [opponentGoals, setOpponentGoals] = useState(match.score?.sets?.[0]?.opponent ?? '');
    const [manualWinner,  setManualWinner]  = useState(match.score?.winner || '');

    const sg = senderGoals   !== '' ? Number(senderGoals)   : null;
    const og = opponentGoals !== '' ? Number(opponentGoals) : null;
    const autoWinnerFb = sg !== null && og !== null
        ? (sg > og ? 'sender' : og > sg ? 'opponent' : 'draw')
        : null;
    const finalWinnerFb = manualWinner || (autoWinnerFb === 'draw' ? 'draw' : autoWinnerFb);

    // ── Set-based sports (tennis, padel…) ───────────────────────────────────
    const [sets, setSets]       = useState(match.score?.sets || [{ sender: '', opponent: '' }]);
    const [setWinner, setSetWinner] = useState(match.score?.winner || '');

    const addSet    = () => setSets(prev => [...prev, { sender: '', opponent: '' }]);
    const removeSet = (i) => setSets(prev => prev.filter((_, idx) => idx !== i));
    const updateSet = (i, side, val) => setSets(prev => prev.map((s, idx) => idx === i ? { ...s, [side]: val } : s));

    const filledSets        = sets.filter(s => s.sender !== '' && s.opponent !== '');
    const senderSetsWon     = filledSets.filter(s => Number(s.sender) > Number(s.opponent)).length;
    const opponentSetsWon   = filledSets.filter(s => Number(s.opponent) > Number(s.sender)).length;
    const autoWinnerSet     = senderSetsWon > opponentSetsWon ? 'sender'
                            : opponentSetsWon > senderSetsWon ? 'opponent' : null;

    // ── Save ────────────────────────────────────────────────────────────────
    const [isSaving, setIsSaving] = useState(false);

    const canSave = isFootball
        ? (sg !== null && og !== null && finalWinnerFb && finalWinnerFb !== 'draw')
        : !!(setWinner || autoWinnerSet);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            let payload;
            if (isFootball) {
                payload = {
                    sets: [{ sender: sg, opponent: og }],
                    winner: finalWinnerFb,
                };
            } else {
                payload = { sets, winner: setWinner || autoWinnerSet };
            }
            const { data } = await api.patch(`/rivals/${match.id}/score`, payload);
            onSave(data);
        } catch (err) { console.error(err); }
        finally { setIsSaving(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
                    <div>
                        <h3 className="text-white font-bold">📊 {isCompetitive ? 'Enter Match Score' : 'Log Score'}</h3>
                        {isCompetitive
                            ? <p className="text-red-400 text-xs mt-0.5">⚔️ Ranked — ELO points will update</p>
                            : <p className="text-gray-500 text-xs mt-0.5">Practice — optional, no points at stake</p>
                        }
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {isFootball ? (
                        <>
                            {/* Big scoreline */}
                            <div className="flex items-center gap-4">
                                {/* Sender */}
                                <div className="flex-1 text-center">
                                    <p className="text-gray-400 text-xs font-bold mb-2 truncate">{senderLabel}</p>
                                    <input
                                        type="number" min="0" max="99"
                                        value={senderGoals}
                                        onChange={e => { setSenderGoals(e.target.value); setManualWinner(''); }}
                                        placeholder="0"
                                        className={`w-full text-center rounded-2xl py-4 border focus:outline-none text-5xl font-black transition
                                            ${sg !== null && og !== null && sg > og
                                                ? `bg-gradient-to-b ${config.color} text-white border-transparent`
                                                : 'bg-gray-800 text-white border-gray-700 focus:border-green-500'}`}
                                    />
                                </div>
                                <span className="text-gray-600 font-black text-2xl flex-shrink-0">—</span>
                                {/* Opponent */}
                                <div className="flex-1 text-center">
                                    <p className="text-gray-400 text-xs font-bold mb-2 truncate">{opponentLabel}</p>
                                    <input
                                        type="number" min="0" max="99"
                                        value={opponentGoals}
                                        onChange={e => { setOpponentGoals(e.target.value); setManualWinner(''); }}
                                        placeholder="0"
                                        className={`w-full text-center rounded-2xl py-4 border focus:outline-none text-5xl font-black transition
                                            ${sg !== null && og !== null && og > sg
                                                ? `bg-gradient-to-b ${config.color} text-white border-transparent`
                                                : 'bg-gray-800 text-white border-gray-700 focus:border-green-500'}`}
                                    />
                                </div>
                            </div>

                            {/* Auto-winner feedback */}
                            {autoWinnerFb && (
                                <div className="text-center">
                                    {autoWinnerFb === 'draw'
                                        ? <p className="text-yellow-400 text-sm font-bold">🤝 Draw — select winner manually if needed</p>
                                        : <p className="text-green-400 text-sm font-bold">
                                            🏆 {autoWinnerFb === 'sender' ? senderLabel : opponentLabel} wins
                                          </p>
                                    }
                                </div>
                            )}

                            {/* Manual winner override (needed for draws or correction) */}
                            {(autoWinnerFb === 'draw' || manualWinner) && (
                                <div>
                                    <p className="text-gray-400 text-xs mb-2">Select winner:</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[{ val: 'sender', label: senderLabel }, { val: 'opponent', label: opponentLabel }].map(opt => (
                                            <button key={opt.val} onClick={() => setManualWinner(opt.val)}
                                                className={`py-2.5 rounded-xl border font-bold text-sm transition ${manualWinner === opt.val ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                                                🏆 {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Set-based (tennis/padel) */}
                            {sets.length > 1 && (
                                <div className="text-center">
                                    <p className="text-white font-black text-2xl">{senderSetsWon} — {opponentSetsWon}</p>
                                    <p className="text-gray-500 text-xs">sets</p>
                                </div>
                            )}

                            {sets.map((set, i) => {
                                const s = Number(set.sender), o = Number(set.opponent);
                                const rw = set.sender !== '' && set.opponent !== ''
                                    ? (s > o ? 'sender' : o > s ? 'opponent' : null) : null;
                                return (
                                    <div key={i} className="flex items-center gap-2">
                                        <span className="text-gray-500 text-xs w-10 text-right flex-shrink-0">Set {i + 1}</span>
                                        <input type="number" min="0" max="99" value={set.sender}
                                            onChange={e => updateSet(i, 'sender', e.target.value)} placeholder="0"
                                            className={`flex-1 text-center rounded-xl px-3 py-2.5 border focus:outline-none text-xl font-black transition ${rw === 'sender' ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 text-white border-gray-700 focus:border-purple-500'}`} />
                                        <span className="text-gray-600 font-bold text-lg">-</span>
                                        <input type="number" min="0" max="99" value={set.opponent}
                                            onChange={e => updateSet(i, 'opponent', e.target.value)} placeholder="0"
                                            className={`flex-1 text-center rounded-xl px-3 py-2.5 border focus:outline-none text-xl font-black transition ${rw === 'opponent' ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 text-white border-gray-700 focus:border-purple-500'}`} />
                                        {sets.length > 1 && (
                                            <button onClick={() => removeSet(i)} className="text-gray-600 hover:text-red-400 text-sm flex-shrink-0 w-5">✕</button>
                                        )}
                                    </div>
                                );
                            })}

                            <button onClick={addSet} className="w-full text-gray-500 hover:text-gray-300 text-xs py-2 border border-dashed border-gray-700 rounded-xl transition">
                                + Add Set
                            </button>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-gray-400 text-xs">🏆 Winner</p>
                                    {autoWinnerSet && !setWinner && <p className="text-green-400 text-xs">Auto-detected</p>}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[{ val: 'sender', label: senderLabel }, { val: 'opponent', label: opponentLabel }].map(opt => {
                                        const active = (setWinner || autoWinnerSet) === opt.val;
                                        return (
                                            <button key={opt.val} onClick={() => setSetWinner(opt.val)}
                                                className={`py-2.5 rounded-xl border font-bold text-sm transition ${active ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                                                🏆 {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-gray-800 flex gap-3">
                    <button onClick={onClose} className="flex-1 bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl border border-gray-700 text-sm">
                        {isCompetitive ? 'Cancel' : 'Skip'}
                    </button>
                    <button onClick={handleSave} disabled={isSaving || !canSave}
                        className={`flex-1 bg-gradient-to-r ${config.color} text-white font-bold py-2.5 rounded-xl disabled:opacity-40 text-sm`}>
                        {isSaving ? 'Saving...' : isCompetitive ? '⚔️ Submit Score' : '💾 Save Score'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Full-screen Posts Overlay
function PostsOverlay({ posts, config, onClose }) {
    const [expandedPostId, setExpandedPostId] = useState(null);
    const [comments, setComments] = useState({});
    const [newComment, setNewComment] = useState('');

    const handleExpand = async (postId) => {
        if (expandedPostId === postId) { setExpandedPostId(null); return; }
        setExpandedPostId(postId);
        if (!comments[postId]) {
            try {
                const { data } = await api.get(`/posts/${postId}/comments`);
                setComments(prev => ({ ...prev, [postId]: data }));
            } catch { /* ignore */ }
        }
    };

    const handleAddComment = async (postId) => {
        if (!newComment.trim()) return;
        try {
            const { data } = await api.post(`/posts/${postId}/comment`, { content: newComment });
            setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), data] }));
            setNewComment('');
        } catch (err) { console.error(err); }
    };

    return (
        <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
            <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-4 flex-shrink-0">
                <button onClick={onClose} className="text-gray-400 hover:text-white transition text-xl">←</button>
                <h2 className="text-white font-bold text-lg">💬 All Posts</h2>
                <span className="text-gray-500 text-sm">{posts.length} posts</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full space-y-3">
                {posts.map(post => (
                    <div key={post.id} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                        <div className="p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <div className={`w-9 h-9 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                                    {post.user?.username?.[0]?.toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <p className="text-white font-bold">{post.user?.fullName}</p>
                                    <p className="text-gray-500 text-xs">@{post.user?.username} · {new Date(post.createdAt).toLocaleDateString()}</p>
                                </div>
                            </div>
                            <p className="text-gray-200 mb-3">{post.content}</p>
                            <button
                                onClick={() => handleExpand(post.id)}
                                className={`text-xs flex items-center gap-1 transition ${expandedPostId === post.id ? 'text-purple-400' : 'text-gray-400 hover:text-purple-400'}`}
                            >
                                💬 {post._count?.comments || 0} comments {expandedPostId === post.id ? '▲' : '▼'}
                            </button>
                        </div>
                        {expandedPostId === post.id && (
                            <div className="border-t border-gray-800 bg-gray-950 p-4 space-y-3">
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {!comments[post.id] ? (
                                        <p className="text-gray-500 text-sm text-center py-3">Loading...</p>
                                    ) : comments[post.id].length === 0 ? (
                                        <p className="text-gray-500 text-sm text-center py-3">No comments yet. Be the first!</p>
                                    ) : (
                                        comments[post.id].map(c => (
                                            <div key={c.id} className="flex gap-2">
                                                <div className={`w-7 h-7 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                                    {c.user?.username?.[0]?.toUpperCase()}
                                                </div>
                                                <div className="bg-gray-800 rounded-xl px-3 py-2 flex-1">
                                                    <p className="text-white text-xs font-bold">@{c.user?.username}</p>
                                                    <p className="text-gray-300 text-sm mt-0.5">{c.content}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        value={newComment}
                                        onChange={e => setNewComment(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddComment(post.id)}
                                        placeholder="Write a comment..."
                                        className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-purple-500"
                                    />
                                    <button
                                        onClick={() => handleAddComment(post.id)}
                                        className={`bg-gradient-to-r ${config.color} text-white font-bold px-4 py-2 rounded-xl text-sm`}
                                    >
                                        Send
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// Court autocomplete for tournament creation
function CourtAutocomplete({ location, onLocationChange, inputCls, labelCls }) {
    const [courtName, setCourtName]   = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selected, setSelected]     = useState(null); // full court object
    const [city, setCity]             = useState('');
    const [address, setAddress]       = useState('');
    const timerRef = useRef(null);

    useEffect(() => {
        if (selected) return;
        if (!courtName.trim()) { setSuggestions([]); return; }
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            try {
                const { data } = await api.get('/courts/search', { params: { name: courtName } });
                setSuggestions(data.slice(0, 6));
            } catch { setSuggestions([]); }
        }, 300);
        return () => clearTimeout(timerRef.current);
    }, [courtName, selected]);

    const pick = (court) => {
        setSelected(court);
        setCourtName(court.name);
        setSuggestions([]);
        // build location string and propagate up
        const loc = [court.name, court.city, court.address].filter(Boolean).join(', ');
        onLocationChange(loc);
    };

    const clear = () => {
        setSelected(null);
        setCourtName('');
        setCity('');
        setAddress('');
        onLocationChange('');
    };

    // When manual city/address changes, update parent
    const updateManual = (newCity, newAddr) => {
        const loc = [courtName, newCity, newAddr].filter(Boolean).join(', ');
        onLocationChange(loc);
    };

    return (
        <div className="space-y-2">
            {/* Court name input */}
            <div className="relative">
                <label className={labelCls}>🏟️ Court / Venue Name</label>
                <div className="relative">
                    <input
                        value={courtName}
                        onChange={e => { setSelected(null); setCourtName(e.target.value); }}
                        placeholder="Search court name..."
                        className={inputCls}
                    />
                    {selected && (
                        <button onClick={clear}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs">✕</button>
                    )}
                </div>
                {/* Dropdown */}
                {suggestions.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl">
                        {suggestions.map(c => (
                            <button key={c.id} onClick={() => pick(c)}
                                className="w-full text-left px-4 py-2.5 hover:bg-gray-700 transition border-b border-gray-700/50 last:border-0">
                                <p className="text-white text-sm font-bold">{c.name}</p>
                                <p className="text-gray-400 text-xs">{[c.city, c.address].filter(Boolean).join(' · ')}</p>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* If court found in DB: show city + address read-only */}
            {selected && (
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-2.5 space-y-0.5">
                    {selected.city    && <p className="text-gray-300 text-xs">🏙️ {selected.city}</p>}
                    {selected.address && <p className="text-gray-400 text-xs">📍 {selected.address}</p>}
                </div>
            )}

            {/* If not in DB and court name typed: manual city + address */}
            {!selected && courtName.trim() && (
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className={labelCls}>🏙️ City</label>
                        <input value={city} onChange={e => { setCity(e.target.value); updateManual(e.target.value, address); }}
                            placeholder="e.g. Istanbul" className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>📍 Address</label>
                        <input value={address} onChange={e => { setAddress(e.target.value); updateManual(city, e.target.value); }}
                            placeholder="Street / district" className={inputCls} />
                    </div>
                </div>
            )}
        </div>
    );
}

// Full-screen News Overlay
function NewsOverlay({ news, config, onClose }) {
    return (
        <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
            <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-4 flex-shrink-0">
                <button onClick={onClose} className="text-gray-400 hover:text-white transition text-xl">←</button>
                <h2 className="text-white font-bold text-lg">📰 {config.name} News</h2>
                <span className="text-gray-500 text-sm">{news.length} articles</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full space-y-3">
                {news.map((item, i) => (
                    <a
                        key={i}
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block bg-gray-900 rounded-2xl border border-gray-800 hover:border-gray-600 transition overflow-hidden group"
                    >
                        {item.thumbnail && (
                            <img
                                src={item.thumbnail}
                                alt={item.title}
                                className="w-full h-40 object-cover"
                                onError={e => { e.target.style.display = 'none'; }}
                            />
                        )}
                        <div className="p-4">
                            <h3 className="text-white font-bold mb-1 group-hover:text-purple-300 transition">{item.title}</h3>
                            {item.description && (
                                <p className="text-gray-400 text-sm mb-2 line-clamp-2"
                                   dangerouslySetInnerHTML={{ __html: item.description.replace(/<[^>]*>/g, '') }}
                                />
                            )}
                            <p className="text-gray-600 text-xs">
                                {new Date(item.pubDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                                <span className="ml-2 text-purple-500">Read full article →</span>
                            </p>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}

function SubCategoryPage() {
    const { category, sub } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const dispatch = useDispatch();
    const myIdFromRedux = useSelector(state => state.auth.user?.id);
    const isAdmin       = useSelector(state => state.auth.user?.isAdmin);
    const lang          = useSelector(state => state.lang.lang);
    const { t }         = useTranslation();
    // Decode JWT directly — works after page refresh too
    const myId = (() => {
        try {
            const token = localStorage.getItem('activity_token');
            if (!token) return myIdFromRedux || null;
            return JSON.parse(atob(token.split('.')[1])).userId || myIdFromRedux;
        } catch { return myIdFromRedux || null; }
    })();
    const [activeTab, setActiveTab] = useState(sub === 'football' ? 'player_wanted' : 'rivals');
    const [tournamentView, setTournamentView] = useState(null); // null | 'pick' | 'mix_double' | 'singles' | 'team' | 'bracket' | 'manage'
    const [tournaments, setTournaments] = useState([]);
    const [tournamentsLoading, setTournamentsLoading] = useState(false);
    const [newTournamentName, setNewTournamentName] = useState('');
    const [newTournamentLocation, setNewTournamentLocation] = useState('');
    const [newTournamentDate, setNewTournamentDate] = useState('');
    const [newTournamentTime, setNewTournamentTime] = useState('');
    const [newTournamentEndDate, setNewTournamentEndDate] = useState('');
    const [newTournamentEndTime, setNewTournamentEndTime] = useState('');
    const [newTournamentRegDate, setNewTournamentRegDate] = useState('');
    const [newTournamentRegTime, setNewTournamentRegTime] = useState('');
    const [newTournamentMinPlayers, setNewTournamentMinPlayers] = useState('');
    const [newTournamentMaxPlayers, setNewTournamentMaxPlayers] = useState('');
    const [newTournamentGenderType, setNewTournamentGenderType] = useState('MIX');
    const [newTournamentSurface, setNewTournamentSurface] = useState('');
    const [newTournamentIsIndoor, setNewTournamentIsIndoor] = useState(null); // null | true | false
    const [selectedTournamentType, setSelectedTournamentType] = useState(null);
    const [pollEnabled, setPollEnabled] = useState(false);
    const [pollTypes, setPollTypes] = useState([]);
    const [pollEndDate, setPollEndDate] = useState('');
    const [pollEndTime, setPollEndTime] = useState('');
    const [votingTournamentId, setVotingTournamentId] = useState(null);
    const [expandedTournament, setExpandedTournament] = useState(null);
    const [tournPartnerLoading, setTournPartnerLoading] = useState(false);
    const [tournInvitePicker, setTournInvitePicker] = useState(null); // { tournamentId, candidates }
    const [matchesModalTournament, setMatchesModalTournament] = useState(null);
    const [tournMatchesData, setTournMatchesData] = useState({ matches: [], myTeamId: null, teams: [] });
    const [matchTab, setMatchTab] = useState('matches'); // 'matches' | 'standings'
    const [scoreEntryMatchId, setScoreEntryMatchId] = useState(null);
    const [scoreSets, setScoreSets] = useState([{ p1: '', p2: '' }, { p1: '', p2: '' }]);
    const [matchActionLoading, setMatchActionLoading] = useState(false);
    const [tournChatMessages, setTournChatMessages] = useState([]);
    const [tournChatInput, setTournChatInput] = useState('');
    const [rulesOpen, setRulesOpen] = useState(false);
    const [managingTournament, setManagingTournament] = useState(null);
    const [joinRequests, setJoinRequests] = useState({}); // { [tournamentId]: [...] }
    const [demoProgress, setDemoProgress] = useState(null); // null | { current, total, intervalId }
    const demoIntervalRef = useRef(null);
    const [mixPlayers, setMixPlayers] = useState(() =>
        Array.from({ length: 32 }, (_, i) => ({ id: i, firstName: '', lastName: '', gender: 'M', paid: false }))
    );
    const [bracket, setBracket] = useState(null); // full tournament state
    const [bracketTournamentId, setBracketTournamentId] = useState(null); // which tournament owns the bracket
    const [rivals, setRivals] = useState([]);
    const [playerWantedPosts, setPlayerWantedPosts] = useState([]);
    const [upcomingMatches, setUpcomingMatches] = useState([]);
    const [myInterest, setMyInterest] = useState(null); // current user's stat for this sport
    const [completedMatches, setCompletedMatches] = useState([]);
    const [archivedMatches, setArchivedMatches] = useState([]);
    const [showAllArchive, setShowAllArchive] = useState(false);
    const [archiveFilter, setArchiveFilter] = useState({ city: '', court: '', dateFrom: '', dateTo: '' });
    const [archiveTab, setArchiveTab] = useState('rivals'); // 'rivals' | 'tournaments'
    const [archivedTournaments, setArchivedTournaments] = useState([]);
    const [expandedArchiveTIds, setExpandedArchiveTIds] = useState(new Set());
    const [scoringMatch, setScoringMatch] = useState(null);
    const [teamChallengeRival, setTeamChallengeRival] = useState(null);
    // Çiftler: bireysel başvurular arası partner davet/kabul/geri çek
    const [partnerActionLoading, setPartnerActionLoading] = useState(false);
    const [joinInvitePicker, setJoinInvitePicker] = useState(null); // { rivalId, candidates }
    const [posts, setPosts] = useState([]);
    const [mediaPosts, setMediaPosts] = useState([]);
    const [coachListings, setCoachListings] = useState([]);
    const [coachForm, setCoachForm] = useState(false);
    const [coachSubTab, setCoachSubTab] = useState('listings'); // 'listings' | 'courses' | 'referees' | 'cvs'
    const [refereeListings, setRefereeListings] = useState([]);
    const [loadingReferees, setLoadingReferees] = useState(false);
    const [refereesLoaded, setRefereesLoaded] = useState(false);
    const [equipmentListings, setEquipmentListings] = useState([]);
    const [loadingEquipment, setLoadingEquipment] = useState(false);
    const [equipmentLoaded, setEquipmentLoaded] = useState(false);
    const [showEquipmentForm, setShowEquipmentForm] = useState(false);
    const [equipmentForm, setEquipmentForm] = useState({ title: '', price: '', condition: 'NEW', description: '', location: '', images: [] });
    const [equipmentFiles, setEquipmentFiles] = useState([]); // File[] not yet uploaded
    const [submittingEquipment, setSubmittingEquipment] = useState(false);
    const [selectedEquipment, setSelectedEquipment] = useState(null);
    const [equipmentViewStatus, setEquipmentViewStatus] = useState('ACTIVE'); // 'ACTIVE' | 'SOLD'
    const [equipmentOffers, setEquipmentOffers] = useState([]);
    const [loadingEquipmentOffers, setLoadingEquipmentOffers] = useState(false);
    const [showOfferForm, setShowOfferForm] = useState(false);
    const [offerForm, setOfferForm] = useState({ price: '', message: '' });
    const [submittingOffer, setSubmittingOffer] = useState(false);
    const [respondingOfferId, setRespondingOfferId] = useState(null);
    const [equipmentActionLoading, setEquipmentActionLoading] = useState(false);
    const [acceptDateModal, setAcceptDateModal] = useState({ visible: false, offerId: null, date: '' });
    const [counterInput, setCounterInput] = useState({ visible: false, offerId: null, price: '' });
    const [showCreateReferee, setShowCreateReferee] = useState(false);
    const [refApplyForm, setRefApplyForm] = useState({ postId: null, price: '', message: '' });
    const [submittingRefApply, setSubmittingRefApply] = useState(false);
    const [refCounterInput, setRefCounterInput] = useState({ requestId: null, price: '', message: '' });
    const [respondingRefId, setRespondingRefId] = useState(null);
    const [refAppsCache, setRefAppsCache] = useState({});
    const [cityAlertStatus, setCityAlertStatus] = useState({}); // { [tab]: { subscribed, city, loading } }

    const loadCityAlertStatus = async (tab) => {
        try {
            const { data } = await api.get(`/city-alerts/${sub}`, { params: { tab } });
            setCityAlertStatus(prev => ({ ...prev, [tab]: { subscribed: data.subscribed, city: data.city, loading: false } }));
        } catch { setCityAlertStatus(prev => ({ ...prev, [tab]: { subscribed: false, city: null, loading: false } })); }
    };

    useEffect(() => {
        const tab = activeTab === 'coaches' ? (coachSubTab === 'referees' ? 'referees' : 'coaches') : activeTab;
        if (['rivals', 'tournaments', 'equipment', 'coaches', 'referees'].includes(tab) && !cityAlertStatus[tab]) {
            loadCityAlertStatus(tab);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, coachSubTab, sub]);

    const toggleCityAlert = async (tab) => {
        setCityAlertStatus(prev => ({ ...prev, [tab]: { ...prev[tab], loading: true } }));
        try {
            const { data } = await api.post('/city-alerts', { subCategory: sub, tab });
            setCityAlertStatus(prev => ({ ...prev, [tab]: { subscribed: data.subscribed, city: data.city, loading: false } }));
        } catch (e) {
            alert(e?.response?.data?.message || t('common.action_failed') || 'İşlem başarısız');
            setCityAlertStatus(prev => ({ ...prev, [tab]: { ...prev[tab], loading: false } }));
        }
    };

    // Not: CityAlertBtn kasıtlı olarak hook kullanmayan saf bir render fonksiyonu —
    // her render'da yeniden tanımlansa da kendi state'i olmadığı için sorun yaratmıyor.
    // Durumu yüklemek için aşağıdaki tab-bazlı useEffect kullanılıyor.
    const CityAlertBtn = ({ tab, desc }) => {
        const st = cityAlertStatus[tab];
        return (
            <button type="button"
                title={desc}
                onClick={() => {
                    if (st?.loading) return;
                    if (!st?.subscribed && !confirm('Profilinizdeki şehirde bu kategoride yeni ilan açıldığında bildirim almak istiyor musunuz?')) return;
                    toggleCityAlert(tab);
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold transition flex-shrink-0 ${st?.subscribed ? `bg-gradient-to-r ${config.color} border-transparent text-white` : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                {st?.loading ? '...' : st?.subscribed ? '🔔' : '🔕'} {st?.subscribed ? (st?.city || '') : ''}
            </button>
        );
    };
    const [peerReviewRivalId, setPeerReviewRivalId] = useState(null);
    const [branchStories, setBranchStories] = useState([]);
    const [newTextPost, setNewTextPost] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const [showRivalForm, setShowRivalForm] = useState(false);
    const [rivalCityFilter, setRivalCityFilter] = useState('');
    const [rivalDateFilter, setRivalDateFilter] = useState('all'); // 'all' | 'today' | 'week' | 'month' | 'custom'
    const [rivalDateFrom, setRivalDateFrom] = useState('');
    const [rivalDateTo, setRivalDateTo] = useState('');
    const [showRivalDateFilter, setShowRivalDateFilter] = useState(false);
    const [news, setNews] = useState([]);
    const [sportsTickets, setSportsTickets] = useState([]);
    const [loadingTickets, setLoadingTickets] = useState(false);
    const [ticketsLoaded, setTicketsLoaded] = useState(false);
    const [ticketCity, setTicketCity] = useState('');
    const [ticketDateFrom, setTicketDateFrom] = useState('');
    const [ticketDateTo, setTicketDateTo] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [refereeForm, setRefereeForm] = useState(null);
    const [refereeSubTab, setRefereeSubTab] = useState('referees'); // 'referees' | 'listings'
    const [refereesLocFilter, setRefereesLocFilter] = useState('');
    const [listingsLocFilter, setListingsLocFilter] = useState('');
    const [showPostsOverlay, setShowPostsOverlay] = useState(false);
    const [showNewsOverlay, setShowNewsOverlay] = useState(false);
    const [viewingContent, setViewingContent] = useState(null);
    const [expandedPostId, setExpandedPostId] = useState(null);
    const [comments, setComments] = useState({});
    const [newComment, setNewComment] = useState('');

    const isWellness = WELLNESS_BRANCHES.has(sub);

    const WELLNESS_CONFIG = {
        wellness: { name: 'Yoga / Pilates / Reformer', emoji: '🧘', color: 'from-teal-500 to-cyan-400', bg: 'bg-teal-500/10', border: 'border-teal-500/30' },
    };

    const config = isWellness
        ? WELLNESS_CONFIG.wellness
        : (SUB_CONFIG[sub] || {
            name: sub,
            emoji: '🏃',
            color: 'from-purple-500 to-blue-500',
            bg: 'bg-purple-500/10',
            border: 'border-purple-500/30',
        });
    const categoryUpper = category.toUpperCase();

    // Maintenance gate — block access to disabled sub-categories
    if (ENABLED_SUBS[sub] === false) {
        return (
            <div className="min-h-screen bg-gray-950">
                <Navbar onBack={() => navigate(-1)} />
                <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
                    <div className="text-8xl mb-6">🔧</div>
                    <h2 className="text-3xl font-black text-white mb-3">
                        {config?.name || sub} — Under Maintenance
                    </h2>
                    <p className="text-gray-400 text-lg max-w-md mb-2">{MAINTENANCE_MESSAGE.en}</p>
                    <p className="text-gray-500 text-sm mb-8">{MAINTENANCE_MESSAGE.tr}</p>
                    <button
                        onClick={() => navigate(`/category/${category}`)}
                        className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white font-bold px-6 py-3 rounded-2xl transition"
                    >
                        ← Go Back
                    </button>
                </div>
            </div>
        );
    }

    // Persist bracket to localStorage whenever it changes
    useEffect(() => {
        if (!bracketTournamentId) return;
        if (bracket) {
            localStorage.setItem(`bracket_${bracketTournamentId}`, JSON.stringify(bracket));
            localStorage.setItem(`bracket_players_${bracketTournamentId}`, JSON.stringify(mixPlayers));
        }
    }, [bracket, bracketTournamentId]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const results = await Promise.allSettled([
                    api.get(`/rivals?category=${categoryUpper}&subCategory=${sub}`),
                    api.get(`/rivals?category=${categoryUpper}&subCategory=${sub}&matchType=PLAYER_WANTED`),
                    api.get(`/rivals/upcoming`),
                    api.get(`/rivals/completed?category=${categoryUpper}&subCategory=${sub}`),
                    api.get(`/rivals/archived?category=${categoryUpper}&subCategory=${sub}`),
                    api.get('/interests/my'),
                    api.get(`/posts?category=${categoryUpper}&subCategory=${sub}&type=POST&communityOnly=true&limit=50`),
                    api.get(`/posts?category=${categoryUpper}&subCategory=${sub}&mediaOnly=true&limit=50`),
                    api.get(`/posts?category=${categoryUpper}&subCategory=${sub}&type=REEL&limit=50`),
                    api.get(`/posts?category=${categoryUpper}&subCategory=${sub}&type=STORY&limit=20`),
                    api.get(`/tournaments?category=${categoryUpper}&subCategory=${sub}`),
                    api.get(`/tournaments/archived?category=${categoryUpper}&subCategory=${sub}`),
                    api.get(`/coaches?category=${categoryUpper}&subCategory=${sub}`),
                ]);
                const ok = (i) => results[i].status === 'fulfilled' ? results[i].value : null;
                const rivalsRes            = ok(0);
                const playerWantedRes      = ok(1);
                const upcomingRes          = ok(2);
                const completedRes         = ok(3);
                const archivedRes          = ok(4);
                const myInterestsRes       = ok(5);
                const communityRes         = ok(6);
                const mediaRes             = ok(7);
                const reelsRes             = ok(8);
                const storiesRes           = ok(9);
                const tournamentsRes         = ok(10);
                const archivedTournamentsRes = ok(11);
                const coachesRes             = ok(12);

                if (rivalsRes) setRivals(rivalsRes.data.filter(r => r.matchType !== 'PLAYER_WANTED').map(r => ({
                    ...r,
                    _mySentRequest: r._myJoinStatus === 'PENDING' || r._myJoinStatus === 'ACCEPTED',
                })));
                if (playerWantedRes) setPlayerWantedPosts(playerWantedRes.data.map(r => ({
                    ...r,
                    _mySentRequest: r._myJoinStatus === 'PENDING' || r._myJoinStatus === 'ACCEPTED',
                })));
                if (upcomingRes) setUpcomingMatches(upcomingRes.data.filter(r =>
                    r.category === categoryUpper && r.subCategory === sub
                ));
                if (completedRes) setCompletedMatches(completedRes.data);
                if (archivedRes)  setArchivedMatches(archivedRes.data);
                setArchivedTournaments(archivedTournamentsRes?.data || []);
                if (myInterestsRes) {
                    const myInt = myInterestsRes.data.find(i =>
                        i.category === categoryUpper && i.subCategory === sub
                    );
                    setMyInterest(myInt || null);
                }
                if (communityRes) setPosts(communityRes.data);
                if (mediaRes && reelsRes) setMediaPosts([...mediaRes.data, ...reelsRes.data]);
                if (coachesRes) setCoachListings(coachesRes.data);
                if (storiesRes) setBranchStories(storiesRes.data);
                const tList = tournamentsRes?.data || [];
                setTournaments(tList.map(tn => ({ ...tn, _myRequest: tn.participants?.[0]?.status || null })));

                // Auto-open manage view if ?manageTournament= is in URL
                const manageTid = searchParams.get('manageTournament');
                if (manageTid) {
                    const t = tList.find(x => x.id === manageTid);
                    if (t && t.creatorId === myId) {
                        const reqs = await api.get(`/tournaments/${manageTid}/requests`);
                        setJoinRequests(prev => ({ ...prev, [manageTid]: reqs.data }));
                        setManagingTournament(t);
                        setActiveTab('tournaments');
                        setTournamentView('manage');
                        setSearchParams({}, { replace: true });
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();

        api.get(`/news/${sub}?lang=${lang}`)
            .then(({ data }) => setNews(data))
            .catch(() => setNews([]));
    }, [sub, categoryUpper, lang]);

    const loadSportsTickets = async () => {
        setLoadingTickets(true);
        try {
            const params = { sport: sub };
            if (ticketCity.trim()) params.city = ticketCity.trim();
            if (ticketDateFrom) params.dateFrom = ticketDateFrom;
            if (ticketDateTo) params.dateTo = ticketDateTo;
            const { data } = await api.get('/sports-tickets/search', { params });
            setSportsTickets(data.events || []);
        } catch { setSportsTickets([]); }
        finally { setLoadingTickets(false); setTicketsLoaded(true); }
    };

    useEffect(() => {
        if (activeTab === 'tickets' && !ticketsLoaded) loadSportsTickets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, ticketsLoaded]);

    const loadRefereeListings = async () => {
        setLoadingReferees(true);
        try {
            const { data } = await api.get('/referees', { params: { category: categoryUpper, subCategory: sub } });
            setRefereeListings(data || []);
        } catch { setRefereeListings([]); }
        finally { setLoadingReferees(false); setRefereesLoaded(true); }
    };

    useEffect(() => {
        if (COACH_EXPANDED_SPORTS.has(sub) && activeTab === 'coaches' && coachSubTab === 'referees' && !refereesLoaded) {
            loadRefereeListings();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, coachSubTab, refereesLoaded, sub]);

    const reloadPlayerWanted = async () => {
        try {
            const { data } = await api.get(`/rivals?category=${categoryUpper}&subCategory=${sub}&matchType=PLAYER_WANTED`);
            setPlayerWantedPosts(data.map(r => ({ ...r, _mySentRequest: r._myJoinStatus === 'PENDING' || r._myJoinStatus === 'ACCEPTED' })));
        } catch {}
    };

    // Hakem ilanı sahibi olduğum gölge ilanlar için başvuruları ayrıca çekiyoruz —
    // playerWantedPosts'a gömülü joinRequests sadece PENDING/AWAITING_JOINER_CONFIRM
    // durumundakileri içeriyor, COUNTERED (karşı teklif) aşamasındakiler kayboluyor.
    useEffect(() => {
        const myShadowAds = playerWantedPosts.filter(p =>
            p.senderId === myId && Array.isArray(p.positions) && p.positions.includes('REFEREE') && p.linkedRivalId
        );
        myShadowAds.forEach(ad => {
            api.get(`/rivals/${ad.linkedRivalId}/referee-applications`)
                .then(({ data }) => setRefAppsCache(prev => ({ ...prev, [ad.id]: Array.isArray(data.applications) ? data.applications : [] })))
                .catch(() => {});
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playerWantedPosts, myId]);

    const applyAsReferee = async (postId) => {
        if (!parseInt(refApplyForm.price) || parseInt(refApplyForm.price) <= 0) {
            if (!confirm(t('referees.apply_price_ph') + '?')) return;
        }
        setSubmittingRefApply(true);
        try {
            await api.post(`/rivals/${postId}/respond`, {
                offerPrice: refApplyForm.price ? `${parseInt(refApplyForm.price, 10)}₺` : undefined,
                offerMessage: refApplyForm.message.trim() || undefined,
            });
            setRefApplyForm({ postId: null, price: '', message: '' });
            await reloadPlayerWanted();
        } catch (e) { alert(e?.response?.data?.message || t('common.action_failed') || 'İşlem başarısız'); }
        finally { setSubmittingRefApply(false); }
    };

    const respondRefJoin = async (requestId, action, price, message) => {
        setRespondingRefId(requestId);
        try {
            await api.patch(`/rivals/join/${requestId}`, { action, price, message });
            if (action === 'counter') setRefCounterInput({ requestId: null, price: '', message: '' });
            await reloadPlayerWanted();
        } catch (e) { alert(e?.response?.data?.message || t('common.action_failed') || 'İşlem başarısız'); }
        finally { setRespondingRefId(null); }
    };

    const loadEquipment = async () => {
        setLoadingEquipment(true);
        try {
            const { data } = await api.get('/equipment', { params: { category: categoryUpper, subCategory: sub, status: equipmentViewStatus } });
            setEquipmentListings(Array.isArray(data) ? data : []);
        } catch { setEquipmentListings([]); }
        finally { setLoadingEquipment(false); setEquipmentLoaded(true); }
    };

    useEffect(() => {
        if (EQUIPMENT_SPORTS.has(sub) && activeTab === 'equipment') {
            setEquipmentLoaded(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, sub, equipmentViewStatus]);

    useEffect(() => {
        if (EQUIPMENT_SPORTS.has(sub) && activeTab === 'equipment' && !equipmentLoaded) {
            loadEquipment();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, equipmentLoaded, sub, equipmentViewStatus]);

    const submitEquipment = async () => {
        if (!equipmentForm.title.trim()) return alert(t('equipment.title_required') || 'Ürün adı zorunludur');
        if (!parseInt(equipmentForm.price) || parseInt(equipmentForm.price) <= 0) return alert(t('equipment.price_required') || 'Fiyat zorunludur');
        if (!equipmentForm.location.trim()) return alert(t('equipment.location_required') || 'Konum zorunludur');
        if (equipmentForm.description.trim().length < 5) return alert(t('equipment.description_required') || 'Açıklama en az 5 karakter olmalıdır');
        if (equipmentFiles.length === 0) return alert(t('equipment.photo_required') || 'En az 1 fotoğraf eklemelisiniz');
        setSubmittingEquipment(true);
        try {
            const uploadedUrls = [];
            for (const file of equipmentFiles) {
                const form = new FormData();
                form.append('file', file);
                const { data } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
                uploadedUrls.push(data.url);
            }
            await api.post('/equipment', {
                ...equipmentForm, category: categoryUpper, subCategory: sub,
                price: parseInt(equipmentForm.price) || 0, images: uploadedUrls,
            });
            setShowEquipmentForm(false);
            setEquipmentForm({ title: '', price: '', condition: 'NEW', description: '', location: '', images: [] });
            setEquipmentFiles([]);
            setEquipmentLoaded(false);
            loadEquipment();
        } catch (e) {
            alert(e?.response?.data?.message || t('common.action_failed') || 'İşlem başarısız');
        } finally { setSubmittingEquipment(false); }
    };

    const deleteEquipment = async (id) => {
        if (!confirm(t('equipment.delete_confirm') || 'Bu ilanı silmek istediğinize emin misiniz?')) return;
        try {
            await api.delete(`/equipment/${id}`);
            setEquipmentListings(prev => prev.filter(e => e.id !== id));
            setSelectedEquipment(null);
        } catch (e) {
            alert(e?.response?.data?.message || t('common.action_failed') || 'İşlem başarısız');
        }
    };

    const openChatWithSeller = async (listing, targetUserId) => {
        const otherId = targetUserId || listing.userId;
        const isOwnerContactingBidder = otherId !== listing.userId;
        try {
            const { data: conv } = await api.get(`/messages/conversation/${otherId}`);
            try {
                const { data: history } = await api.get(`/messages/conversation/${conv.id}/messages`);
                const alreadyReferenced = (history || []).some(m => m.equipmentListingId === listing.id || m.equipmentListing?.id === listing.id);
                if (!alreadyReferenced) {
                    await api.post(`/messages/send/${otherId}`, {
                        content: isOwnerContactingBidder
                            ? `🎾 "${listing.title}" ilanına verdiğiniz teklif hakkında yazıyorum.`
                            : `🎾 "${listing.title}" ilanı hakkında mesajlaşmak istiyorum.`,
                        equipmentListingId: listing.id,
                    });
                }
            } catch { /* geçmiş/otomatik mesaj başarısız olsa da sohbeti açmaya devam et */ }
            setSelectedEquipment(null);
            navigate(`/messages/${otherId}`);
        } catch (e) {
            alert(e?.response?.data?.message || t('common.action_failed') || 'İşlem başarısız');
        }
    };

    const loadEquipmentOffers = async (listingId) => {
        setLoadingEquipmentOffers(true);
        try {
            const { data } = await api.get(`/equipment/${listingId}/offers`);
            setEquipmentOffers(Array.isArray(data) ? data : []);
        } catch { setEquipmentOffers([]); }
        finally { setLoadingEquipmentOffers(false); }
    };

    useEffect(() => {
        if (selectedEquipment && selectedEquipment.userId === myId) loadEquipmentOffers(selectedEquipment.id);
        else setEquipmentOffers([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEquipment?.id]);

    const sendEquipmentOffer = async () => {
        if (!parseInt(offerForm.price) || parseInt(offerForm.price) <= 0) return alert(t('equipment.offer_price_ph') || 'Geçerli bir teklif fiyatı girin');
        setSubmittingOffer(true);
        try {
            const { data } = await api.post(`/equipment/${selectedEquipment.id}/offers`, { price: parseInt(offerForm.price), message: offerForm.message.trim() || undefined });
            setSelectedEquipment(prev => prev ? { ...prev, myOffer: data } : prev);
            setShowOfferForm(false);
            setOfferForm({ price: '', message: '' });
            alert(t('equipment.offer_sent_msg') || 'Teklifiniz gönderildi');
        } catch (e) { alert(e?.response?.data?.message || t('common.action_failed') || 'İşlem başarısız'); }
        finally { setSubmittingOffer(false); }
    };

    const respondEquipmentOffer = async (offerId, action, reservedUntil, price) => {
        setRespondingOfferId(offerId);
        try {
            const { data } = await api.patch(`/equipment/offers/${offerId}`, { action, reservedUntil, price });
            if (action === 'accept' && data.listing) {
                setSelectedEquipment(prev => prev ? { ...prev, ...data.listing } : prev);
                setEquipmentListings(prev => prev.map(e => e.id === data.listing.id ? { ...e, ...data.listing } : e));
            }
            if (action === 'counter') setCounterInput({ visible: false, offerId: null, price: '' });
            await loadEquipmentOffers(selectedEquipment.id);
        } catch (e) { alert(e?.response?.data?.message || t('common.action_failed') || 'İşlem başarısız'); }
        finally { setRespondingOfferId(null); }
    };

    const respondToMyOfferCounter = async (offerId, action) => {
        setRespondingOfferId(offerId);
        try {
            await api.patch(`/equipment/offers/${offerId}`, { action });
            const { data } = await api.get(`/equipment/${selectedEquipment.id}`);
            setSelectedEquipment(prev => prev ? { ...prev, ...data } : prev);
        } catch (e) { alert(e?.response?.data?.message || t('common.action_failed') || 'İşlem başarısız'); }
        finally { setRespondingOfferId(null); }
    };

    const cancelEquipmentReservation = async (id) => {
        setEquipmentActionLoading(true);
        try {
            const { data } = await api.patch(`/equipment/${id}/unreserve`);
            setSelectedEquipment(prev => prev ? { ...prev, ...data } : prev);
            setEquipmentListings(prev => prev.map(e => e.id === data.id ? { ...e, ...data } : e));
            loadEquipmentOffers(id);
        } catch (e) { alert(e?.response?.data?.message || t('common.action_failed') || 'İşlem başarısız'); }
        finally { setEquipmentActionLoading(false); }
    };

    const markEquipmentSold = async (id) => {
        setEquipmentActionLoading(true);
        try {
            await api.patch(`/equipment/${id}/sold`);
            setEquipmentListings(prev => prev.filter(e => e.id !== id));
            setSelectedEquipment(null);
        } catch (e) { alert(e?.response?.data?.message || t('common.action_failed') || 'İşlem başarısız'); }
        finally { setEquipmentActionLoading(false); }
    };

    // Socket.io — real-time rival updates (paylaşılan socket servisi üzerinden — kendi
    // io() bağlantısını açmak hem env URL'ini yok sayıyordu hem de gereksiz ikinci bir
    // bağlantı açıyordu)
    useEffect(() => {
        if (!myId) return;
        connectSocket(myId);

        const applyRivalUpdate = (updatedRival) => {
            const upsertCompleted = (prev) => {
                const exists = prev.some(r => r.id === updatedRival.id);
                return exists
                    ? prev.map(r => r.id === updatedRival.id ? updatedRival : r)
                    : [updatedRival, ...prev];
            };

            // Player Wanted posts update
            if (updatedRival.matchType === 'PLAYER_WANTED') {
                if (updatedRival.status === 'OPEN') {
                    setPlayerWantedPosts(prev => {
                        const exists = prev.find(r => r.id === updatedRival.id);
                        return exists
                            ? prev.map(r => r.id === updatedRival.id ? updatedRival : r)
                            : prev;
                    });
                } else if (updatedRival.status === 'MATCHED') {
                    setPlayerWantedPosts(prev => prev.filter(r => r.id !== updatedRival.id));
                    if (updatedRival.category === categoryUpper && updatedRival.subCategory === sub) {
                        setUpcomingMatches(prev => {
                            const exists = prev.some(r => r.id === updatedRival.id);
                            return exists
                                ? prev.map(r => r.id === updatedRival.id ? updatedRival : r)
                                : [...prev, updatedRival];
                        });
                    }
                } else if (updatedRival.status === 'COMPLETED') {
                    setPlayerWantedPosts(prev => prev.filter(r => r.id !== updatedRival.id));
                    setUpcomingMatches(prev => prev.filter(r => r.id !== updatedRival.id));
                    if (updatedRival.category === categoryUpper && updatedRival.subCategory === sub) {
                        setCompletedMatches(upsertCompleted);
                    }
                } else {
                    setPlayerWantedPosts(prev => prev.filter(r => r.id !== updatedRival.id));
                }
                return;
            }

            // Update rival in open list (join requests changed, or status changed)
            if (updatedRival.status === 'OPEN') {
                setRivals(prev => {
                    const exists = prev.find(r => r.id === updatedRival.id);
                    return exists
                        ? prev.map(r => r.id === updatedRival.id ? updatedRival : r)
                        : prev;
                });
            } else if (updatedRival.status === 'MATCHED') {
                setRivals(prev => prev.filter(r => r.id !== updatedRival.id));
                if (updatedRival.category === categoryUpper && updatedRival.subCategory === sub) {
                    // Always upsert — if HTTP response already added it, update; otherwise add
                    setUpcomingMatches(prev => {
                        const exists = prev.some(r => r.id === updatedRival.id);
                        return exists
                            ? prev.map(r => r.id === updatedRival.id ? updatedRival : r)
                            : [...prev, updatedRival];
                    });
                }
            } else if (updatedRival.status === 'COMPLETED') {
                setRivals(prev => prev.filter(r => r.id !== updatedRival.id));
                setUpcomingMatches(prev => prev.filter(r => r.id !== updatedRival.id));
                if (updatedRival.category === categoryUpper && updatedRival.subCategory === sub) {
                    setCompletedMatches(upsertCompleted);
                }
            }
        };

        // Sadece {rivalId} taşıyan event'ler (joinAccepted/joinRejected/joinLateAccepted) —
        // ilgili ilanı tekrar çekip aynı upsert mantığından geçiriyoruz.
        const refetchAndApply = (rivalId) => {
            api.get(`/rivals/${rivalId}`).then(({ data }) => applyRivalUpdate(data)).catch(() => {});
        };
        const removeFromAllLists = (rivalId) => {
            setRivals(prev => prev.filter(r => r.id !== rivalId));
            setPlayerWantedPosts(prev => prev.filter(r => r.id !== rivalId));
            setUpcomingMatches(prev => prev.filter(r => r.id !== rivalId));
        };
        const bumpCommentCount = (rivalId) => {
            const bump = (prev) => prev.map(r => r.id === rivalId ? { ...r, commentCount: (r.commentCount || 0) + 1 } : r);
            setRivals(bump); setPlayerWantedPosts(bump); setUpcomingMatches(bump);
        };

        const offUpdate  = onSocket('rivalUpdate', applyRivalUpdate);
        const offDeleted = onSocket('rivalDeleted', ({ rivalId }) => removeFromAllLists(rivalId));
        const offAccepted = onSocket('joinAccepted', ({ rivalId }) => refetchAndApply(rivalId));
        const offRejected = onSocket('joinRejected', ({ rivalId }) => refetchAndApply(rivalId));
        const offLateAccepted = onSocket('joinLateAccepted', ({ rivalId }) => refetchAndApply(rivalId));
        const offComment = onSocket('newComment', ({ rivalId }) => bumpCommentCount(rivalId));

        // Turnuva anket oyu degisince ilgili turnuvalari tazele (global broadcast, oda bazli degil)
        const offVote = onSocket('tournament:vote_updated', () => {
            api.get(`/tournaments?category=${categoryUpper}&subCategory=${sub}`)
                .then(({ data }) => setTournaments(data.map(tn => ({ ...tn, _myRequest: tn.participants?.[0]?.status || null }))))
                .catch(() => {});
        });

        return () => { offUpdate(); offDeleted(); offAccepted(); offRejected(); offLateAccepted(); offComment(); offVote(); };
    }, [myId, categoryUpper, sub]);

    const handleTextPost = async (e) => {
        e.preventDefault();
        if (!newTextPost.trim()) return;
        setIsPosting(true);
        try {
            const { data } = await api.post('/posts', {
                category: categoryUpper,
                subCategory: sub,
                content: newTextPost,
            });
            setPosts(prev => [data, ...prev]);
            setNewTextPost('');
        } catch (err) {
            console.error(err);
        } finally {
            setIsPosting(false);
        }
    };

    const handleCancel = async (rivalId) => {
        try {
            await api.patch(`/rivals/${rivalId}/cancel`);
            setRivals(prev => prev.filter(r => r.id !== rivalId));
            setUpcomingMatches(prev => prev.filter(r => r.id !== rivalId));
        } catch (err) {
            alert(err.response?.data?.message || 'Error');
        }
    };

    const handleChallenge = async (rivalId) => {
        try {
            const { data } = await api.post(`/rivals/${rivalId}/respond`);
            alert(data.message);
            // Mark as "request sent" in UI
            setRivals(prev => prev.map(r => r.id === rivalId ? { ...r, _mySentRequest: true } : r));
        } catch (err) {
            alert(err.response?.data?.message || 'Error');
        }
    };

    const handleRespondJoin = async (joinRequestId, action, rivalId) => {
        try {
            const { data } = await api.patch(`/rivals/join/${joinRequestId}`, { action });
            if (action === 'accept') {
                setRivals(prev => prev.map(r => r.id === rivalId ? {
                    ...r,
                    ...data.request,
                    joinRequests: data.request.joinRequests || [],
                } : r));
                if (data.matched) {
                    setRivals(prev => prev.filter(r => r.id !== rivalId));
                    // Upsert — socket may also fire; deduplicate
                    setUpcomingMatches(prev => {
                        const exists = prev.some(r => r.id === rivalId);
                        return exists
                            ? prev.map(r => r.id === rivalId ? data.request : r)
                            : [...prev, data.request];
                    });
                }
            } else {
                // Remove from pending list
                setRivals(prev => prev.map(r => r.id === rivalId ? {
                    ...r,
                    joinRequests: (r.joinRequests || []).filter(jr => jr.id !== joinRequestId),
                } : r));
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Error');
        }
    };

    // İlan sahibi yanlışlıkla kabul ettiği bir katılımcıyı (çiftlerde takımın tamamını) çıkarır
    const removeRivalParticipant = async (rivalId, participantUserId, participantName) => {
        if (!confirm(`${participantName ? '@' + participantName : 'This user'} will be removed from the match and the listing will reopen. Are you sure?`)) return;
        try {
            const { data } = await api.delete(`/rivals/${rivalId}/participants/${participantUserId}`);
            setRivals(prev => prev.map(r => r.id === rivalId ? { ...r, ...data.request } : r));
        } catch (err) {
            alert(err.response?.data?.message || 'Error');
        }
    };

    const [seedingDemoRivalId, setSeedingDemoRivalId] = useState(null);
    const sendRivalDemoJoin = async (rivalId) => {
        setSeedingDemoRivalId(rivalId);
        try {
            const { data } = await api.post('/demo/rival-join', { rivalId });
            alert(`Demo join request(s) sent: ${data.joined.join(', ')}`);
        } catch (err) {
            alert(err.response?.data?.message || 'Error');
        } finally {
            setSeedingDemoRivalId(null);
        }
    };

    // Çiftler: kendi bireysel başvurumun partner durumunu değiştirir — davet et / kabul et / geri çek
    const setMyRivalJoinPartner = async (rivalId, partnerId) => {
        setPartnerActionLoading(true);
        try {
            const { data } = await api.patch(`/rivals/${rivalId}/join-partner`, { partnerId: partnerId || null });
            setRivals(prev => prev.map(r => r.id !== rivalId ? r : {
                ...r,
                joinRequests: (r.joinRequests || []).some(jr => jr.id === data.id)
                    ? r.joinRequests.map(jr => jr.id === data.id ? { ...jr, ...data } : jr)
                    : [...(r.joinRequests || []), data],
            }));
            setJoinInvitePicker(null);
        } catch (err) {
            alert(err.response?.data?.message || 'Error');
        } finally {
            setPartnerActionLoading(false);
        }
    };

    // Çiftler: eşleşmiş bir çifti ya da partner arayan bireyseli ikili kart olarak render eder
    const renderRivalDuoCard = (rival, p1, p2, solos, byUserId, isOwnerView) => {
        const nameOf = (jr) => jr?.user?.fullName || jr?.user?.username || '';
        const ratingOf = (jr) => (jr?.user?.interests || []).find(i => i.subCategory === sub)?.skillRating;
        const Half = ({ jr }) => (
            <div className="min-w-0">
                <p className="text-white text-xs font-bold truncate">{nameOf(jr)}</p>
                <p className="text-gray-500 text-[10px] truncate">
                    @{jr?.user?.username}{ratingOf(jr) != null ? `  ${Number(ratingOf(jr)).toFixed(2)}★` : ''}
                </p>
            </div>
        );

        let slot2;
        if (p2) {
            slot2 = <Half jr={p2} />;
        } else {
            const isMine = p1.userId === myId;
            const invitedBy = solos.find(o => o.partnerId === p1.userId && o.userId !== p1.userId);
            if (p1.partnerId) {
                const target = byUserId.get(p1.partnerId);
                slot2 = (
                    <div className="min-w-0">
                        <p className="text-yellow-400 text-[10px] font-bold truncate">⏳ {nameOf(target) || '...'} (waiting)</p>
                        {isMine && (
                            <button onClick={() => setMyRivalJoinPartner(rival.id, null)} disabled={partnerActionLoading}
                                className="text-red-400 text-[10px] font-bold mt-0.5">✕ Withdraw</button>
                        )}
                    </div>
                );
            } else if (invitedBy) {
                slot2 = (
                    <div className="min-w-0">
                        <p className="text-green-400 text-[10px] font-bold truncate">{nameOf(invitedBy)} invited you</p>
                        {isMine && (
                            <button onClick={() => setMyRivalJoinPartner(rival.id, invitedBy.userId)} disabled={partnerActionLoading}
                                className="bg-green-600/30 border border-green-500/50 text-green-400 text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded-lg">✓ Accept</button>
                        )}
                    </div>
                );
            } else {
                slot2 = (
                    <div className="min-w-0">
                        <p className="text-gray-500 text-[10px]">Looking for partner</p>
                        {isMine && (
                            <button
                                onClick={() => setJoinInvitePicker({ rivalId: rival.id, candidates: solos.filter(s => s.userId !== myId) })}
                                disabled={partnerActionLoading}
                                className={`bg-gradient-to-r ${config.color} text-white text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded-lg`}>
                                + Invite
                            </button>
                        )}
                    </div>
                );
            }
        }

        const isMineCard = p1.userId === myId || p2?.userId === myId;
        return (
            <div key={p1.id} className={`rounded-xl p-2 border ${isMineCard ? `${config.border} bg-gray-700/60` : 'border-gray-700 bg-gray-800'}`}>
                <div className="flex items-start gap-2">
                    <Half jr={p1} />
                    <span className="text-gray-500 text-xs font-black">+</span>
                    {slot2}
                </div>
                {isOwnerView && (
                    <div className="flex gap-1.5 mt-1.5">
                        <button onClick={() => handleRespondJoin(p1.id, 'accept', rival.id)}
                            className="flex-1 bg-green-600/80 hover:bg-green-600 text-white text-[10px] font-bold py-1 rounded-lg transition">✓ Accept</button>
                        <button onClick={() => handleRespondJoin(p1.id, 'reject', rival.id)}
                            className="flex-1 bg-gray-700 hover:bg-red-600/40 text-gray-300 hover:text-red-400 text-[10px] font-bold py-1 rounded-lg transition">✕ Reject</button>
                    </div>
                )}
            </div>
        );
    };

    const TYPE_LABEL = {
        '1': `🏆 ${t('tournament.type1')}`,
        '2': `👬 ${t('tournament.type2')}`,
        '3': `🎯 ${t('tournament.type3')}`,
        '4': `🎯👬 ${t('tournament.type4')}`,
    };

    const handleRequestAction = async (tournamentId, userId, status) => {
        try {
            await api.patch(`/tournaments/${tournamentId}/requests/${userId}`, { status });
            setJoinRequests(prev => ({
                ...prev,
                [tournamentId]: (prev[tournamentId] || []).map(r => (r.userId === userId || r.user?.id === userId) ? { ...r, status } : r),
            }));
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    // Çiftler Rekabetçi: kendi başvurumun partner durumunu değiştirir — davet et / kabul et / geri çek
    const setMyTournamentPartner = async (tournamentId, partnerId) => {
        setTournPartnerLoading(true);
        try {
            const { data } = await api.patch(`/tournaments/${tournamentId}/partner`, { partnerId: partnerId || null });
            setJoinRequests(prev => ({
                ...prev,
                [tournamentId]: (prev[tournamentId] || []).map(r => r.id === data.id ? { ...r, ...data } : r),
            }));
            setTournInvitePicker(null);
        } catch (err) { alert(err?.response?.data?.message || 'Error'); }
        finally { setTournPartnerLoading(false); }
    };

    // Çiftler: eşleşmiş bir çifti ya da partner arayan bireyseli ikili kart olarak render eder
    const renderTournamentDuoCard = (tournamentId, p1, p2, solos, byUserId, isOwnerView) => {
        const nameOf = (r) => r?.user?.fullName || r?.user?.username || '';
        const ratingOf = (r) => (r?.user?.interests || [])[0]?.skillRating;
        const Half = ({ r }) => (
            <div className="min-w-0">
                <p className="text-white text-xs font-bold truncate">{nameOf(r)}</p>
                <p className="text-gray-500 text-[10px] truncate">
                    @{r?.user?.username}{ratingOf(r) != null ? `  ${Number(ratingOf(r)).toFixed(2)}★` : ''}
                </p>
            </div>
        );

        let slot2;
        if (p2) {
            slot2 = <Half r={p2} />;
        } else {
            const isMine = p1.userId === myId;
            const invitedBy = solos.find(o => o.partnerId === p1.userId && o.userId !== p1.userId);
            if (p1.partnerId) {
                const target = byUserId.get(p1.partnerId);
                slot2 = (
                    <div className="min-w-0">
                        <p className="text-yellow-400 text-[10px] font-bold truncate">⏳ {nameOf(target) || '...'} ({t('tournament.waiting')})</p>
                        {isMine && (
                            <button onClick={() => setMyTournamentPartner(tournamentId, null)} disabled={tournPartnerLoading}
                                className="text-red-400 text-[10px] font-bold mt-0.5">{t('tournament.withdraw_invite')}</button>
                        )}
                    </div>
                );
            } else if (invitedBy) {
                slot2 = (
                    <div className="min-w-0">
                        <p className="text-green-400 text-[10px] font-bold truncate">{nameOf(invitedBy)} {t('tournament.invited_you')}</p>
                        {isMine && (
                            <button onClick={() => setMyTournamentPartner(tournamentId, invitedBy.userId)} disabled={tournPartnerLoading}
                                className="bg-green-600/30 border border-green-500/50 text-green-400 text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded-lg">{t('tournament.accept_invite')}</button>
                        )}
                    </div>
                );
            } else {
                slot2 = (
                    <div className="min-w-0">
                        <p className="text-gray-500 text-[10px]">{t('tournament.looking_for_partner')}</p>
                        {isMine && (
                            <button
                                onClick={() => setTournInvitePicker({ tournamentId, candidates: solos.filter(s => s.userId !== myId) })}
                                disabled={tournPartnerLoading}
                                className={`bg-gradient-to-r ${config.color} text-white text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded-lg`}>
                                {t('tournament.invite_partner')}
                            </button>
                        )}
                    </div>
                );
            }
        }

        const isMineCard = p1.userId === myId || p2?.userId === myId;
        return (
            <div key={p1.id} className={`rounded-xl p-2 border ${isMineCard ? `${config.border} bg-gray-700/60` : 'border-gray-700 bg-gray-800'}`}>
                <div className="flex items-start gap-2">
                    <Half r={p1} />
                    <span className="text-gray-500 text-xs font-black">+</span>
                    {slot2}
                </div>
                {p2 && ratingOf(p1) != null && ratingOf(p2) != null && (
                    <p className="text-purple-300 text-[10px] font-bold text-center mt-1">
                        Takım Ort: {((Number(ratingOf(p1)) + Number(ratingOf(p2))) / 2).toFixed(2)}★
                    </p>
                )}
                {isOwnerView && (
                    <div className="flex gap-1.5 mt-1.5">
                        <button onClick={() => handleRequestAction(tournamentId, p1.userId, 'ACCEPTED')}
                            className="flex-1 bg-green-600/80 hover:bg-green-600 text-white text-[10px] font-bold py-1 rounded-lg transition">✓ Accept</button>
                        <button onClick={() => handleRequestAction(tournamentId, p1.userId, 'REJECTED')}
                            className="flex-1 bg-gray-700 hover:bg-red-600/40 text-gray-300 hover:text-red-400 text-[10px] font-bold py-1 rounded-lg transition">✕ Reject</button>
                    </div>
                )}
            </div>
        );
    };

    const fetchTournMatches = async (tournamentId) => {
        try {
            const { data } = await api.get(`/tournaments/${tournamentId}/matches`);
            setTournMatchesData(data);
        } catch { setTournMatchesData({ matches: [], myTeamId: null, teams: [] }); }
    };

    const openMatchesModal = (tournament) => {
        setMatchesModalTournament(tournament);
        setMatchTab('matches');
        fetchTournMatches(tournament.id);
        fetchTournChat(tournament.id);
    };

    const handleStartTournament = async (tournament) => {
        if (!confirm(`${tournament.name} — start this tournament now? No more join requests will be accepted after this.`)) return;
        setMatchActionLoading(true);
        try {
            const { data } = await api.post(`/tournaments/${tournament.id}/start`);
            setTournaments(prev => prev.map(x => x.id === tournament.id ? { ...x, ...data } : x));
            openMatchesModal({ ...tournament, ...data });
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
        finally { setMatchActionLoading(false); }
    };

    const computeTournamentStandings = (matches) => {
        const stats = {};
        const ensure = (id, name) => { if (!stats[id]) stats[id] = { id, name, played: 0, won: 0, lost: 0, setsW: 0, setsL: 0, pts: 0 }; };
        matches.filter(m => m.phase === 'GROUP' && m.status === 'COMPLETED' && m.p1Id && m.p2Id).forEach(m => {
            ensure(m.p1Id, m.p1Name); ensure(m.p2Id, m.p2Name);
            const sc = m.score || {};
            stats[m.p1Id].played++; stats[m.p2Id].played++;
            stats[m.p1Id].setsW += sc.p1Sets || 0; stats[m.p1Id].setsL += sc.p2Sets || 0;
            stats[m.p2Id].setsW += sc.p2Sets || 0; stats[m.p2Id].setsL += sc.p1Sets || 0;
            if (m.winnerId === m.p1Id) { stats[m.p1Id].won++; stats[m.p1Id].pts += 3; stats[m.p2Id].lost++; }
            else if (m.winnerId === m.p2Id) { stats[m.p2Id].won++; stats[m.p2Id].pts += 3; stats[m.p1Id].lost++; }
        });
        return Object.values(stats).sort((a, b) => b.pts - a.pts || (b.setsW - b.setsL) - (a.setsW - a.setsL));
    };

    const openScoreEntry = (match) => {
        const existing = match.score?.sets;
        setScoreEntryMatchId(match.id);
        setScoreSets(existing && existing.length ? existing.map(s => ({ p1: String(s.p1 ?? ''), p2: String(s.p2 ?? '') })) : [{ p1: '', p2: '' }, { p1: '', p2: '' }]);
    };

    const submitMatchScore = async (tournamentId, match) => {
        const sets = scoreSets
            .map(s => ({ p1: parseInt(s.p1), p2: parseInt(s.p2) }))
            .filter(s => !isNaN(s.p1) && !isNaN(s.p2));
        if (sets.length === 0) { alert('Enter at least one set score'); return; }
        let p1Sets = 0, p2Sets = 0;
        sets.forEach(s => { if (s.p1 > s.p2) p1Sets++; else if (s.p2 > s.p1) p2Sets++; });
        if (p1Sets === p2Sets) { alert('Sets are tied — cannot determine a winner'); return; }
        const winner = p1Sets > p2Sets ? 'p1' : 'p2';
        setMatchActionLoading(true);
        try {
            const { data } = await api.patch(`/tournaments/${tournamentId}/matches/${match.id}/score`, { sets, winner });
            setTournMatchesData(prev => ({ ...prev, matches: data }));
            setScoreEntryMatchId(null);
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
        finally { setMatchActionLoading(false); }
    };

    const submitJoker = async (tournamentId, matchId) => {
        if (!confirm('Use your joker for this match? This grants +7 days but uses up your joker right (unless mutual).')) return;
        setMatchActionLoading(true);
        try {
            const { data } = await api.post(`/tournaments/${tournamentId}/matches/${matchId}/joker`);
            alert(data.message);
            fetchTournMatches(tournamentId);
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
        finally { setMatchActionLoading(false); }
    };

    const submitRematch = async (tournament) => {
        if (!confirm(`${tournament.name} — regenerate this tournament's matches? Existing match history for the current stage will be reset.`)) return;
        setMatchActionLoading(true);
        try {
            const { data } = await api.post(`/tournaments/${tournament.id}/rematch`);
            setTournaments(prev => prev.map(x => x.id === tournament.id ? { ...x, ...data } : x));
            fetchTournMatches(tournament.id);
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
        finally { setMatchActionLoading(false); }
    };

    const submitRegenRound = async (tournamentId) => {
        if (!confirm('Regenerate the current pending round\'s matchups?')) return;
        setMatchActionLoading(true);
        try {
            await api.post(`/tournaments/${tournamentId}/regen-round`);
            fetchTournMatches(tournamentId);
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
        finally { setMatchActionLoading(false); }
    };

    const fetchTournChat = async (tournamentId) => {
        try {
            const { data } = await api.get(`/tournaments/${tournamentId}/chat`);
            setTournChatMessages(data);
        } catch { setTournChatMessages([]); }
    };

    const sendTournChat = async (tournamentId) => {
        if (!tournChatInput.trim()) return;
        const content = tournChatInput.trim();
        setTournChatInput('');
        try {
            const { data } = await api.post(`/tournaments/${tournamentId}/chat`, { content });
            setTournChatMessages(prev => [...prev, data]);
        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
    };

    const handleExpandPost = async (postId) => {
        if (expandedPostId === postId) {
            setExpandedPostId(null);
            return;
        }
        setExpandedPostId(postId);
        if (!comments[postId]) {
            try {
                const { data } = await api.get(`/posts/${postId}/comments`);
                setComments(prev => ({ ...prev, [postId]: data }));
            } catch { /* ignore */ }
        }
    };

    const handleAddComment = async (postId) => {
        if (!newComment.trim()) return;
        try {
            const { data } = await api.post(`/posts/${postId}/comment`, { content: newComment });
            setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), data] }));
            setNewComment('');
            setPosts(prev => prev.map(p =>
                p.id === postId ? { ...p, _count: { ...p._count, comments: (p._count?.comments || 0) + 1 } } : p
            ));
        } catch (err) { console.error(err); }
    };

    const handleLike = async (postId) => {
        try {
            await api.post(`/posts/${postId}/like`);
            setPosts(prev => prev.map(p =>
                p.id === postId
                    ? { ...p, isLiked: !p.isLiked, _count: { ...p._count, likes: p._count.likes + (p.isLiked ? -1 : 1) } }
                    : p
            ));
        } catch (err) {
            console.error(err);
        }
    };

    // Rakip bul — il + zaman (Tümü/Bugün/Bu Hafta/Bu Ay/özel aralık) filtresi
    const rivalDateFilterToday = new Date();
    const matchesRivalDateFilter = (dateVal) => {
        if (rivalDateFilter === 'all') return true;
        const d = new Date(dateVal);
        if (isNaN(d)) return true;
        if (rivalDateFilter === 'today') return d.toDateString() === rivalDateFilterToday.toDateString();
        if (rivalDateFilter === 'week') {
            const weekEnd = new Date(rivalDateFilterToday); weekEnd.setDate(rivalDateFilterToday.getDate() + 7);
            return d >= rivalDateFilterToday && d <= weekEnd;
        }
        if (rivalDateFilter === 'month') {
            const monthEnd = new Date(rivalDateFilterToday.getFullYear(), rivalDateFilterToday.getMonth() + 1, 0);
            return d >= rivalDateFilterToday && d <= monthEnd;
        }
        if (rivalDateFilter === 'custom') {
            if (rivalDateFrom && d < new Date(rivalDateFrom)) return false;
            if (rivalDateTo) { const to = new Date(rivalDateTo); to.setHours(23, 59, 59, 999); if (d > to) return false; }
            return true;
        }
        return true;
    };
    const rivalDateFilterLabel = () => {
        if (rivalDateFilter === 'custom') {
            const fmt = (v) => { const d = new Date(v); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };
            if (rivalDateFrom && rivalDateTo) return `${fmt(rivalDateFrom)}–${fmt(rivalDateTo)}`;
            if (rivalDateFrom) return `${fmt(rivalDateFrom)}+`;
            return t('rival.date_all') || 'Tümü';
        }
        return {
            all: t('rival.date_all') || 'Tümü',
            today: t('rival.date_today') || 'Bugün',
            week: t('rival.date_week') || 'Bu Hafta',
            month: t('rival.date_month') || 'Bu Ay',
        }[rivalDateFilter];
    };
    const applyRivalFilter = (item) => {
        if (rivalCityFilter.trim()) {
            const q = rivalCityFilter.trim().toLowerCase();
            const loc = (item.location || '').toLowerCase();
            const court = (item.courtName || '').toLowerCase();
            const addr = (item.courtAddress || '').toLowerCase();
            const senderCity = item.flexibleSchedule ? (item.sender?.city || '').toLowerCase() : '';
            if (!loc.includes(q) && !court.includes(q) && !addr.includes(q) && !senderCity.includes(q)) return false;
        }
        if (item.matchDate && !matchesRivalDateFilter(item.matchDate)) return false;
        return true;
    };
    const filteredRivals = rivals.filter(applyRivalFilter);

    return (
        <div className="min-h-screen bg-gray-950">
            {/* Navbar */}
            <Navbar
                onBack={() => navigate(-1)}
                title={`${config.emoji} ${config.name}`}
            />

            {/* Hikayeler */}
            <div className="bg-gray-900 border-b border-gray-800 px-4 py-4">
                <div className="w-full">
                    <div className="flex gap-4 overflow-x-auto pb-1">
                        <div onClick={() => navigate('/profile')} className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer">
                            <div className={`w-16 h-16 rounded-full bg-gray-800 border-2 border-dashed ${config.border} flex items-center justify-center text-2xl hover:opacity-80 transition`}>
                                +
                            </div>
                            <span className="text-gray-400 text-xs">{t('profile.add_story')}</span>
                        </div>
                        {branchStories.map(story => (
                            <div key={story.id} className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer"
                                onClick={() => setViewingContent(story)}>
                                <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-b from-purple-500 to-pink-500">
                                    <div className="w-full h-full rounded-full bg-gray-900 overflow-hidden flex items-center justify-center">
                                        {story.imageUrl ? (
                                            <img src={story.imageUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-white font-bold text-lg">
                                                {story.user?.username?.[0]?.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className="text-gray-400 text-xs truncate w-16 text-center">{story.user?.username}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Ana İçerik */}
            <div className="w-full px-4 py-6 flex flex-col lg:flex-row gap-4">

                {/* SOL SIDEBAR - %18 */}
                <div className="hidden lg:block lg:w-[18%] shrink-0 space-y-4">

                    {/* Kendi stats kartı */}
                    {myInterest && (
                        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <div className={`w-10 h-10 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white font-black text-lg flex-shrink-0`}>
                                    {config.emoji}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-white text-xs font-bold truncate">{t('stats.your_stats')}</p>
                                    <p className="text-gray-500 text-[10px]">{config.name}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-gray-800 rounded-xl p-2 text-center">
                                    <p className={`font-black text-sm bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                        {Number(myInterest.skillRating || 0).toFixed(2)}★
                                    </p>
                                    <p className="text-gray-500 text-[10px]">{t('stats.rating')}</p>
                                </div>
                                <div className="bg-gray-800 rounded-xl p-2 text-center">
                                    <p className="text-white font-black text-sm">{myInterest.totalPoints || 0}</p>
                                    <p className="text-gray-500 text-[10px]">{t('stats.points')}</p>
                                </div>
                                <div className="bg-gray-800 rounded-xl p-2 text-center">
                                    <p className="text-green-400 font-black text-sm">{myInterest.wins || 0}</p>
                                    <p className="text-gray-500 text-[10px]">{t('stats.wins')}</p>
                                </div>
                                <div className="bg-gray-800 rounded-xl p-2 text-center">
                                    <p className="text-red-400 font-black text-sm">{myInterest.losses || 0}</p>
                                    <p className="text-gray-500 text-[10px]">{t('stats.losses')}</p>
                                </div>
                            </div>
                            {(myInterest.level) && (
                                <div className={`mt-2 text-center py-1.5 rounded-xl bg-gradient-to-r ${config.color} bg-opacity-20`}>
                                    <p className="text-white text-[10px] font-bold">{myInterest.level}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* News */}
                    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                            <h4 className="text-white font-bold text-xs">📰 {config.name} News</h4>
                            {news.length > 3 && (
                                <button onClick={() => setShowNewsOverlay(true)} className="text-purple-400 hover:text-purple-300 text-[10px] transition">
                                    {t('stats.see_all')}
                                </button>
                            )}
                        </div>
                        {news.length === 0 ? (
                            <p className="text-gray-600 text-xs text-center py-4">{t('community.loading_news')}</p>
                        ) : (
                            news.slice(0, 3).map((item, i) => (
                                <a key={i} href={item.link} target="_blank" rel="noopener noreferrer"
                                    className="block hover:bg-gray-800 rounded-xl p-2 transition group -mx-2">
                                    {item.thumbnail && (
                                        <img src={item.thumbnail} alt="" className="w-full h-16 object-cover rounded-lg mb-1.5"
                                            onError={e => { e.target.style.display = 'none'; }} />
                                    )}
                                    <p className="text-gray-300 text-[11px] font-medium line-clamp-2 group-hover:text-white transition">{item.title}</p>
                                    <p className="text-gray-600 text-[10px] mt-0.5">
                                        {new Date(item.pubDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                    </p>
                                </a>
                            ))
                        )}
                    </div>

                </div>

                {/* ANA İÇERİK - %55 */}
                <div className="flex-1 min-w-0 space-y-4">

                    {/* Tabs */}
                    <div className="flex gap-2 bg-gray-900 p-1 rounded-xl border border-gray-800 overflow-x-auto">
                        {(isWellness
                            ? ['events', 'media']
                            : TEAM_SPORTS.has(sub)
                                ? ['player_wanted', 'rivals', 'tournaments', ...(COACH_EXPANDED_SPORTS.has(sub) ? ['coaches'] : []), 'media', 'archive', ...(TICKET_SPORTS.has(sub) ? ['tickets'] : [])]
                                : [
                                    ...LEFT_TABS.slice(0, 3),
                                    ...(EQUIPMENT_SPORTS.has(sub) ? ['equipment'] : []),
                                    ...LEFT_TABS.slice(3),
                                    ...(TICKET_SPORTS.has(sub) ? ['tickets'] : []),
                                  ]
                        ).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-shrink-0 flex-1 py-2 px-3 rounded-lg text-xs font-bold transition whitespace-nowrap ${activeTab === tab
                                    ? `bg-gradient-to-r ${config.color} text-white`
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                {tab === 'player_wanted' ? `👤 ${t('tabs.player_wanted')}` :
                                 tab === 'rivals'        ? `⚔️ ${TEAM_SPORTS.has(sub) ? t('tabs.opponent') : t('tabs.rivals')}` :
                                 tab === 'events'        ? `📅 ${t('tabs.events')}` :
                                 tab === 'tournaments'   ? `🏆 ${t('tabs.tournaments')}` :
                                 tab === 'coaches'       ? `🎓 ${COACH_EXPANDED_SPORTS.has(sub) ? t('tabs.support') : t('tabs.coaches')}` :
                                 tab === 'equipment'     ? `🎾 ${t('tabs.equipment')}` :
                                 tab === 'tickets'       ? `🎟️ ${t('tabs.tickets')}` :
                                 tab === 'archive'       ? `🗃️ ${t('tabs.archive')}` : `📷 ${t('tabs.media')}`}
                            </button>
                        ))}
                        {sub === 'football' && (
                            <button
                                onClick={() => setActiveTab('referee')}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${activeTab === 'referee'
                                    ? `bg-gradient-to-r ${config.color} text-white`
                                    : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                🟨 {t('tabs.referee')}
                            </button>
                        )}
                    </div>

                    {/* RIVALS TAB — hidden for wellness */}
                    {activeTab === 'rivals' && !isWellness && (
                        <div className="space-y-4">

                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <CityAlertBtn tab="rivals" desc="Şehrinde yeni rakip ilanı açılınca bildirim al" />
                                    <div className="flex items-center bg-gray-900 border border-gray-700 rounded-lg px-2 py-1">
                                        <span className="text-gray-500 text-xs mr-1">📍</span>
                                        <input
                                            value={rivalCityFilter}
                                            onChange={e => setRivalCityFilter(e.target.value)}
                                            placeholder={t('rival.city_filter_ph') || 'İl'}
                                            className="bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none w-20"
                                        />
                                        {rivalCityFilter && (
                                            <button onClick={() => setRivalCityFilter('')} className="text-gray-500 hover:text-white text-xs ml-1">✕</button>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowRivalDateFilter(v => !v)}
                                            className={`flex items-center gap-1 rounded-lg px-2 py-1.5 border text-xs font-bold transition ${rivalDateFilter !== 'all' ? `${config.bg} ${config.border} text-white` : 'bg-gray-900 border-gray-700 text-gray-400'}`}
                                        >
                                            📅 {rivalDateFilterLabel()} <span className="text-gray-500">▾</span>
                                        </button>
                                        {showRivalDateFilter && (
                                            <div className="absolute z-20 mt-1 right-0 bg-gray-950 border border-gray-700 rounded-xl p-3 w-64 shadow-xl">
                                                <div className="grid grid-cols-2 gap-1.5 mb-3">
                                                    {[['all', t('rival.date_all') || 'Tümü'], ['today', t('rival.date_today') || 'Bugün'], ['week', t('rival.date_week') || 'Bu Hafta'], ['month', t('rival.date_month') || 'Bu Ay']].map(([v, label]) => (
                                                        <button key={v}
                                                            onClick={() => { setRivalDateFilter(v); setRivalDateFrom(''); setRivalDateTo(''); setShowRivalDateFilter(false); }}
                                                            className={`py-1.5 rounded-lg text-xs font-bold border transition ${rivalDateFilter === v ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                                                            {label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="text-gray-500 text-[11px] font-bold mb-1.5">{t('rival.date_custom_range') || 'Özel Tarih Aralığı'}</p>
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    <input type="date" value={rivalDateFrom} onChange={e => setRivalDateFrom(e.target.value)}
                                                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500" />
                                                    <span className="text-gray-500 text-xs">–</span>
                                                    <input type="date" value={rivalDateTo} onChange={e => setRivalDateTo(e.target.value)}
                                                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500" />
                                                </div>
                                                <button
                                                    onClick={() => { setRivalDateFilter((rivalDateFrom || rivalDateTo) ? 'custom' : 'all'); setShowRivalDateFilter(false); }}
                                                    className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-1.5 rounded-lg text-xs hover:opacity-90 transition`}>
                                                    {t('rival.filter_apply') || 'Uygula'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowRivalForm(!showRivalForm)}
                                    className={`bg-gradient-to-r ${config.color} text-white font-bold px-4 py-2 rounded-xl text-sm`}
                                >
                                    {showRivalForm ? `✕ ${t('common.cancel')}` : `+ ${t('rival.create_listing')}`}
                                </button>
                            </div>

                            {showRivalForm && (
                                <RivalForm
                                    config={config}
                                    categoryUpper={categoryUpper}
                                    sub={sub}
                                    myId={myId}
                                    myInterest={myInterest}
                                    defaultMatchType={sub === 'padel' ? 'DOUBLE' : 'SINGLE'}
                                    onSubmit={(data) => {
                                        setRivals(prev => [data, ...prev]);
                                        setShowRivalForm(false);
                                    }}
                                    onClose={() => setShowRivalForm(false)}
                                />
                            )}

                            {isLoading ? (
                                <p className="text-gray-400 text-center py-8">{t('common.loading')}</p>
                            ) : filteredRivals.length === 0 ? (
                                <div className="text-center py-10 bg-gray-900 rounded-2xl border border-gray-800">
                                    <p className="text-4xl mb-3">⚔️</p>
                                    <p className="text-gray-400">{rivals.length === 0 ? `${t('rival.no_rivals')} ${t('rival.be_first')}` : (t('rival.no_filter_match') || 'Filtreyle eşleşen ilan bulunamadı')}</p>
                                </div>
                            ) : (
                                filteredRivals.map(rival => {
                                    const participants = Array.isArray(rival.participants) ? rival.participants : [];
                                    // Partner sistemi öncesi oluşturulmuş eski ilanlarda kurucunun senderTeam'i
                                    // boştur — onlar hâlâ eski modele göre (3 bireysel katılımcı) tamamlanır.
                                    const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
                                    const required = rival.matchType === 'DOUBLE' ? (senderTeamArr.length > 0 ? 2 : 3) : 1;
                                    const filled = participants.length;
                                    return (
                                        <div key={rival.id} className={`${config.bg} border ${config.border} rounded-2xl px-4 pt-3 pb-1`}>
                                            <div className="flex items-start gap-3 mb-2">
                                                {/* Sol: avatar + isim */}
                                                <div className={`w-10 h-10 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white font-bold flex-shrink-0`}>
                                                    {rival.sender?.username?.[0]?.toUpperCase()}
                                                </div>
                                                <div className="flex-shrink-0">
                                                    <p className="text-white font-bold">{rival.sender?.fullName}</p>
                                                    <p className="text-gray-400 text-xs">@{rival.sender?.username}</p>
                                                    {rival.senderId === myId && myInterest?.assessmentCompleted && (
                                                        <span className={`font-black text-xs bg-gradient-to-r ${config.color} bg-clip-text text-transparent mt-1 block`}>
                                                            {Number(myInterest.skillRating).toFixed(2)} ★
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Orta: esnek program bilgisi */}
                                                {rival.flexibleSchedule && (
                                                    <div className="px-3">
                                                        <p className="text-yellow-400 text-[11px] font-bold">📅 {t('rival.flexible_schedule')} · {t('rival.expires_24h')}</p>
                                                        <p className="text-yellow-300/75 text-[10px] leading-relaxed mt-0.5 whitespace-pre-line">{t('rival.flexible_schedule_desc')}</p>
                                                    </div>
                                                )}

                                                {/* Sağ üst: maç türü + katılım */}
                                                <div className="flex flex-col items-start gap-1 flex-shrink-0 mr-auto">
                                                    {rival.matchMode === 'BOTH' ? (
                                                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                            🏃⚔️ {t('rival.both_modes')}
                                                        </span>
                                                    ) : rival.matchMode === 'COMPETITIVE' ? (
                                                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                                                            ⚔️ Ranked
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                            🏃 Practice
                                                        </span>
                                                    )}
                                                    {TEAM_SPORTS.has(sub) && rival.surface ? (
                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold bg-gradient-to-r ${config.color} text-white`}>
                                                            {rival.teamSize}v{rival.teamSize} ·{' '}
                                                            {(() => {
                                                                const all = [...VOLLEYBALL_SURFACES, ...FOOTBALL_SURFACES];
                                                                const s = all.find(x => x.id === rival.surface);
                                                                return s ? `${s.emoji} ${t(s.tKey)}` : rival.surface;
                                                            })()}
                                                        </span>
                                                    ) : (
                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold bg-gradient-to-r ${config.color} text-white`}>
                                                            {rival.matchType === 'DOUBLE' ? '2v2' : '1v1'}
                                                        </span>
                                                    )}
                                                    <span className="text-gray-400 text-xs">{filled}/{required} joined</span>
                                                </div>

                                                {/* Sağ üst: aksiyon butonları (sadece ilanı açan için) */}
                                                {rival.senderId === myId && (
                                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                        <div className="bg-gray-800 border border-gray-700 text-gray-400 font-bold py-1.5 px-3 rounded-xl text-xs text-center">
                                                            📋 {filled}/{required} joined
                                                        </div>
                                                        <button
                                                            onClick={() => navigate(`/messages?userId=${rival.senderId}`)}
                                                            className="bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 text-blue-400 font-bold px-3 py-1.5 rounded-xl text-xs transition"
                                                        >
                                                            {t('rival.send_message')}
                                                        </button>
                                                        <button
                                                            onClick={() => handleCancel(rival.id)}
                                                            className="bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 font-bold px-3 py-1.5 rounded-xl text-xs transition"
                                                        >
                                                            {t('rival.cancel')}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Level badges */}
                                            <div className="flex flex-wrap gap-2 mb-1">
                                                {rival.level && (
                                                    <span className="bg-gray-800 text-gray-300 text-xs px-3 py-1 rounded-full">
                                                        {rival.level === 'BEGINNER' ? '🟢' : rival.level === 'INTERMEDIATE' ? '🟡' : rival.level === 'ADVANCED' ? '🟠' : '🔴'} {rival.level}
                                                    </span>
                                                )}
                                                {rival.levelDetail && (
                                                    <span className="bg-gray-800 text-purple-300 text-xs px-3 py-1 rounded-full">{rival.levelDetail}</span>
                                                )}
                                            </div>

                                            {rival.message && <p className="text-gray-200 mb-1 text-sm">{rival.message}</p>}

                                            {/* Date / Time / Duration */}
                                            <div className="flex flex-wrap gap-3 mb-1 text-sm">
                                                {rival.matchDate && <span className="text-gray-400">📅 {new Date(rival.matchDate).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})}</span>}
                                                {rival.matchTime && <span className="text-gray-400">🕐 {rival.matchTime}</span>}
                                                {rival.duration && <span className="text-gray-400">⏱️ {DURATION_OPTIONS.find(d=>d.value===String(rival.duration))?.label || rival.duration+' min'}</span>}
                                            </div>

                                            {/* Location block — city + court + address */}
                                            {(rival.location || rival.courtName || rival.courtAddress) && (
                                                <div className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3 mb-3 space-y-1">
                                                    {rival.location && (
                                                        <p className="text-gray-300 text-sm font-bold">
                                                            📍 {rival.location}
                                                        </p>
                                                    )}
                                                    {rival.courtName && (
                                                        <p className="text-white text-sm font-bold">
                                                            🏟️ {rival.courtName}
                                                        </p>
                                                    )}
                                                    {rival.courtAddress && (
                                                        <p className="text-gray-400 text-xs">
                                                            {rival.courtAddress}
                                                        </p>
                                                    )}
                                                    {rival.isCourtReserved && (
                                                        <span className="inline-block text-green-400 text-xs bg-green-500/10 px-2 py-0.5 rounded-full">✓ Court Reserved</span>
                                                    )}
                                                </div>
                                            )}

                                            <button
                                                onClick={() => shareRival(rival)}
                                                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-bold px-3 py-1.5 rounded-xl text-xs transition mb-3"
                                            >
                                                📤 {t('shareBtn')}
                                            </button>

                                            {/* Creator's team (football with senderTeam) */}
                                            {(() => {
                                                const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
                                                if (senderTeamArr.length === 0) return null;
                                                const senderRating = (rival.sender?.interests?.[0]?.skillRating || 0);
                                                const senderAssessed = !!rival.sender?.interests?.[0]?.assessmentCompleted;
                                                const teamAvg = ((senderRating + senderTeamArr.reduce((s, t) => s + (t.skillRating || 0), 0)) / (senderTeamArr.length + 1)).toFixed(2);
                                                return (
                                                    <div className="bg-gray-800/60 rounded-xl p-3 mb-3">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <p className="text-gray-400 text-xs font-bold">⚽ Team ({senderTeamArr.length + 1}/{rival.teamSize})</p>
                                                            <span className={`text-xs font-black bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                                                Avg: {teamAvg}★
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1">
                                                            <span className="text-gray-300 text-xs bg-gray-700 rounded-full px-2 py-0.5">
                                                                {rival.sender?.username} {senderAssessed ? `(${Number(senderRating).toFixed(1)}★)` : ''}
                                                            </span>
                                                            {senderTeamArr.map(t => (
                                                                <span key={t.id} className="text-gray-400 text-xs bg-gray-700/60 rounded-full px-2 py-0.5">
                                                                    {t.username} {t.assessmentCompleted ? `(${Number(t.skillRating).toFixed(1)}★)` : ''}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Accepted participants — owner can remove a wrongly-accepted one */}
                                            {participants.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                                    <span className="text-gray-500 text-xs flex-shrink-0">Joined:</span>
                                                    {participants.filter(Boolean).map(p => (
                                                        <div key={p.id} className="flex items-center gap-1.5 bg-gray-800 rounded-full pl-1 pr-2 py-1">
                                                            <div className={`w-6 h-6 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                                                                {p.username?.[0]?.toUpperCase()}
                                                            </div>
                                                            <span className="text-gray-300 text-xs">{p.username}</span>
                                                            {rival.senderId === myId && (
                                                                <button onClick={() => removeRivalParticipant(rival.id, p.id, p.username)}
                                                                    className="text-red-500/70 hover:text-red-400 text-xs font-bold ml-0.5">✕</button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {rival.senderId === myId && filled < required && (sub === 'tennis' || sub === 'padel') && (
                                                <button onClick={() => sendRivalDemoJoin(rival.id)} disabled={seedingDemoRivalId === rival.id}
                                                    className="w-full bg-purple-600/10 border border-purple-500/30 text-purple-400 hover:bg-purple-600/20 font-bold text-xs px-3 py-1.5 rounded-xl transition mb-3 disabled:opacity-50">
                                                    {seedingDemoRivalId === rival.id ? '...' : '🤖 Send Demo Join Request'}
                                                </button>
                                            )}

                                            {/* Çiftler: herkese ikili kart (eşleşmiş çift / partner arayan bireysel) —
                                                owner ayrıca kabul/red görür */}
                                            {rival.matchType === 'DOUBLE' && (rival.joinRequests || []).length > 0 && (() => {
                                                const { pairs, solos, byUserId } = groupDoublesPairs(rival.joinRequests);
                                                const isOwnerView = rival.senderId === myId;
                                                return (
                                                    <div className="bg-gray-800 rounded-xl p-3 space-y-2 mb-2">
                                                        <p className="text-gray-400 text-xs font-bold">
                                                            📬 Requests ({rival.joinRequests.length})
                                                        </p>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {pairs.map(([a, b]) => renderRivalDuoCard(rival, a, b, solos, byUserId, isOwnerView))}
                                                            {solos.map(s => renderRivalDuoCard(rival, s, null, solos, byUserId, isOwnerView))}
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {rival.senderId === myId ? (
                                                <div className="space-y-2">
                                                    {/* Pending join requests (non-doubles: football team challenge, single matches) */}
                                                    {rival.matchType !== 'DOUBLE' && (rival.joinRequests || []).length > 0 && (
                                                        <div className="bg-gray-800 rounded-xl p-3 space-y-2">
                                                            <p className="text-gray-400 text-xs font-bold">
                                                                📬 Join Requests ({rival.joinRequests.length})
                                                            </p>
                                                            {rival.joinRequests.map(jr => {
                                                                const jTeam = Array.isArray(jr.joiningTeam) ? jr.joiningTeam : [];
                                                                const isTeamChallenge = rival.matchMode === 'COMPETITIVE' && jTeam.length > 0;
                                                                const teamAvg = isTeamChallenge
                                                                    ? (jTeam.reduce((s, t) => s + (t.skillRating || 0), 0) / jTeam.length).toFixed(2)
                                                                    : null;
                                                                return (
                                                                <div key={jr.id} className="space-y-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-7 h-7 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                                                            {jr.user?.username?.[0]?.toUpperCase()}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-white text-xs font-bold truncate">{jr.user?.fullName || jr.user?.username}</p>
                                                                            <p className="text-gray-500 text-[10px]">@{jr.user?.username}{isTeamChallenge ? ` · Team of ${jTeam.length}` : ''}</p>
                                                                            {!isTeamChallenge && (() => {
                                                                                const interest = (jr.user?.interests || []).find(i => i.category === categoryUpper && i.subCategory === sub);
                                                                                if (!interest || interest.totalPoints === 0) return null;
                                                                                return (
                                                                                    <div className="flex items-center gap-1 mt-0.5">
                                                                                        {interest.skillRating > 0 && (
                                                                                            <span className={`font-black text-[10px] bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                                                                                {Number(interest.skillRating).toFixed(2)}★
                                                                                            </span>
                                                                                        )}
                                                                                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full ${
                                                                                            interest.level === 'PRO'          ? 'bg-purple-500/20 text-purple-400' :
                                                                                            interest.level === 'ADVANCED'     ? 'bg-orange-500/20 text-orange-400' :
                                                                                            interest.level === 'INTERMEDIATE' ? 'bg-yellow-500/20 text-yellow-400' :
                                                                                                                                'bg-green-500/20 text-green-400'
                                                                                        }`}>
                                                                                            {interest.totalPoints} pts
                                                                                        </span>
                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                        <button
                                                                            onClick={() => handleRespondJoin(jr.id, 'accept', rival.id)}
                                                                            className="bg-green-600/80 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                                                                        >
                                                                            ✓ Accept
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleRespondJoin(jr.id, 'reject', rival.id)}
                                                                            className="bg-gray-700 hover:bg-red-600/40 text-gray-300 hover:text-red-400 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                                                                        >
                                                                            ✕
                                                                        </button>
                                                                    </div>
                                                                    {/* Joining team preview for COMPETITIVE */}
                                                                    {isTeamChallenge && (
                                                                        <div className="bg-gray-700/60 rounded-xl px-3 py-2">
                                                                            <div className="flex items-center justify-between mb-1">
                                                                                <p className="text-gray-400 text-[10px] font-bold">Challenger's Team</p>
                                                                                <span className={`text-[10px] font-black bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                                                                                    Avg: {teamAvg}★
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {jTeam.map(t => (
                                                                                    <span key={t.id} className="text-gray-300 text-[10px] bg-gray-700 rounded-full px-2 py-0.5">
                                                                                        {t.username} {t.assessmentCompleted ? `(${Number(t.skillRating).toFixed(1)}★)` : ''}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : rival._mySentRequest ? (
                                                <div className="w-full bg-gray-800 border border-gray-700 text-gray-400 font-bold py-2.5 rounded-xl text-sm text-center">
                                                    ⏳ Request sent — waiting for approval
                                                </div>
                                            ) : rival.flexibleSchedule ? (
                                                <div className="space-y-2">
                                                    <p className="text-blue-400 text-[11px] leading-relaxed bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
                                                        📅 {t('rival.flexible_schedule_desc')}
                                                    </p>
                                                    <button
                                                        onClick={() => navigate(`/messages?userId=${rival.senderId}`)}
                                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-sm transition"
                                                    >
                                                        {t('rival.send_message')}
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        const isCompetitiveTeam = rival.matchMode === 'COMPETITIVE' && rival.teamSize > 1 && sub === 'football';
                                                        if (isCompetitiveTeam) {
                                                            setTeamChallengeRival(rival);
                                                        } else {
                                                            handleChallenge(rival.id);
                                                        }
                                                    }}
                                                    className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-2.5 rounded-xl text-sm hover:opacity-90 transition`}
                                                >
                                                    {rival.matchMode === 'COMPETITIVE' && rival.teamSize > 1 && sub === 'football'
                                                        ? `⚔️ Build Team & Challenge`
                                                        : '⚔️ Join Match'}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })
                            )}

                            {/* Upcoming & Completed Matches */}
                            {(() => {
                                const EXTEND_OPTIONS = [24, 48, 72, 96, 120];

                                const ExtendOrScore = ({ match, config, onScore, onExtended }) => {
                                    const [showExtend, setShowExtend] = useState(false);
                                    const [extending, setExtending] = useState(false);

                                    const handleExtend = async (hours) => {
                                        setExtending(true);
                                        try {
                                            const { data } = await api.patch(`/rivals/${match.id}/extend-score`, { hours });
                                            alert(`✓ ${data.message}`);
                                            onExtended({ id: match.id, completedAt: data.completedAt });
                                            setShowExtend(false);
                                        } catch (err) {
                                            alert(err.response?.data?.message || 'Error');
                                        } finally { setExtending(false); }
                                    };

                                    return (
                                        <div className="mt-1 space-y-2">
                                            <div className="flex gap-2">
                                                <button onClick={onScore}
                                                    className={`flex-1 font-bold py-2.5 rounded-xl text-sm hover:opacity-90 transition ${match.matchMode === 'COMPETITIVE' ? `bg-gradient-to-r ${config.color} text-white` : 'bg-gray-700 border border-gray-600 text-gray-300'}`}>
                                                    {match.matchMode === 'COMPETITIVE' ? '⚔️ Enter Score (Required)' : '📊 Log Score (Optional)'}
                                                </button>
                                                <button
                                                    onClick={() => setShowExtend(v => !v)}
                                                    title="Match postponed? Request more time"
                                                    className={`flex-shrink-0 px-3 py-2.5 rounded-xl border text-sm font-bold transition ${showExtend ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}>
                                                    ⏱️
                                                </button>
                                            </div>

                                            {showExtend && (
                                                <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
                                                    <p className="text-gray-400 text-xs font-bold mb-2">⏱️ Match postponed or abandoned? Request extra time:</p>
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {EXTEND_OPTIONS.map(h => (
                                                            <button key={h} onClick={() => handleExtend(h)} disabled={extending}
                                                                className="flex-1 min-w-[46px] bg-gray-700 hover:bg-orange-500/30 hover:border-orange-500/50 border border-gray-600 text-gray-300 hover:text-orange-300 font-bold py-2 rounded-xl text-xs transition disabled:opacity-40">
                                                                +{h}h
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="text-gray-600 text-[10px] mt-2">Score window will be extended. All participants will be notified.</p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                };

                                const now = new Date();
                                const isPast = (m) => {
                                    if (!m.matchDate) return false;
                                    const d = new Date(m.matchDate);
                                    if (m.matchTime) { const [h, min] = m.matchTime.split(':'); d.setHours(+h, +min, 0); }
                                    // Use actual duration if set, otherwise fall back to 1 hour
                                    d.setTime(d.getTime() + (m.duration || 60) * 60 * 1000);
                                    return d <= now;
                                };
                                const future       = upcomingMatches.filter(m => !isPast(m));
                                const pastNoScore  = upcomingMatches.filter(m =>  isPast(m));

                                const typeLabel = (m) =>
                                    m.matchType === 'PLAYER_WANTED'
                                        ? `👥 ${m.teamSize}v${m.teamSize} Match — Ready ✓`
                                        : m.matchType === 'DOUBLE' ? '🎾🎾 Double — CONFIRMED ✓' : '🎾 Single — CONFIRMED ✓';

                                const TeamBlock = ({ label, members, avgRating, colorClass }) => (
                                    <div className="flex-1 min-w-0">
                                        <p className="text-gray-500 text-[10px] font-bold mb-1.5 uppercase tracking-wide">{label}</p>
                                        <div className="space-y-1">
                                            {members.map((p, i) => (
                                                <div key={p.id || i} className="flex items-center gap-1.5">
                                                    <div className={`w-5 h-5 rounded-full bg-gradient-to-b ${colorClass} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0`}>
                                                        {p.username?.[0]?.toUpperCase()}
                                                    </div>
                                                    <span className="text-gray-300 text-xs truncate">{p.fullName || p.username}</span>
                                                    {p.skillRating != null && (
                                                        <span className="text-yellow-400 text-[10px] ml-auto flex-shrink-0">{Number(p.skillRating).toFixed(1)}★</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        {avgRating !== null && (
                                            <p className={`text-[10px] font-black mt-1.5 bg-gradient-to-r ${colorClass} bg-clip-text text-transparent`}>
                                                Avg {avgRating}★
                                            </p>
                                        )}
                                    </div>
                                );

                                const UpcomingCard = ({ m, isPastCard = false }) => {
                                    const [showComments, setShowComments] = useState(false);
                                    const [matchComments, setMatchComments] = useState([]);
                                    const [commentsLoaded, setCommentsLoaded] = useState(false);
                                    const [commentInput, setCommentInput] = useState('');
                                    const [commentSending, setCommentSending] = useState(false);

                                    const toggleComments = async () => {
                                        if (!showComments && !commentsLoaded) {
                                            try {
                                                const { data } = await api.get(`/rivals/${m.id}/comments`);
                                                setMatchComments(data);
                                            } catch { setMatchComments([]); }
                                            setCommentsLoaded(true);
                                        }
                                        setShowComments(prev => !prev);
                                    };
                                    const sendMatchComment = async () => {
                                        if (!commentInput.trim()) return;
                                        setCommentSending(true);
                                        try {
                                            const { data } = await api.post(`/rivals/${m.id}/comments`, { content: commentInput.trim() });
                                            setMatchComments(prev => [...prev, data]);
                                            setCommentInput('');
                                        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
                                        finally { setCommentSending(false); }
                                    };
                                    const deleteMatchComment = async (commentId) => {
                                        try {
                                            await api.delete(`/rivals/comments/${commentId}`);
                                            setMatchComments(prev => prev.filter(c => c.id !== commentId));
                                        } catch (e) { alert(e?.response?.data?.message || 'Error'); }
                                    };

                                    const parts = Array.isArray(m.participants) ? m.participants : [];
                                    const sTeam = Array.isArray(m.senderTeam) ? m.senderTeam : [];
                                    const isTeamMatch = (m.matchMode === 'COMPETITIVE' && sTeam.length > 0 && sub === 'football') || m.matchType === 'DOUBLE';

                                    const creatorTeam = isTeamMatch
                                        ? [{ id: m.senderId, username: m.sender?.username, fullName: m.sender?.fullName, skillRating: m.senderSkillRating ?? null }, ...sTeam]
                                        : null;
                                    const opponentTeam = isTeamMatch ? parts : null;

                                    const avgOf = (arr) => arr.length === 0 ? null
                                        : (arr.reduce((s, p) => s + (p.skillRating || 0), 0) / arr.length).toFixed(1);

                                    const involved = m.senderId === myId || parts.some(p => p.id === myId);

                                    return (
                                        <div className={`rounded-2xl p-4 mb-3 border ${isPastCard ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
                                            {/* Header */}
                                            <div className="flex items-start justify-between gap-2 mb-3">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {isPastCard
                                                        ? <span className="font-bold text-sm text-yellow-400">⏱️ Ended — enter score!</span>
                                                        : <span className={`font-bold text-sm bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>{typeLabel(m)}</span>
                                                    }
                                                    {m.matchMode === 'COMPETITIVE' && (
                                                        <span className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">⚔️ Ranked</span>
                                                    )}
                                                    {m.matchMode === 'PRACTICE' && (
                                                        <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">🏃 Practice</span>
                                                    )}
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    {m.matchDate && (
                                                        <p className="text-gray-400 text-xs">📅 {new Date(m.matchDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</p>
                                                    )}
                                                    {m.matchTime && <p className="text-gray-400 text-xs">🕐 {m.matchTime}</p>}
                                                    {m.duration && <p className="text-gray-500 text-[10px]">⏳ {m.duration} min</p>}
                                                </div>
                                            </div>

                                            {/* Teams */}
                                            {isTeamMatch ? (
                                                <div className="flex gap-3 mb-3">
                                                    <TeamBlock
                                                        label={`${config.emoji} ${m.sender?.username}'s Team`}
                                                        members={creatorTeam}
                                                        avgRating={avgOf(creatorTeam)}
                                                        colorClass={config.color}
                                                    />
                                                    <div className="flex flex-col items-center justify-center px-2">
                                                        <span className="text-gray-600 text-xs font-black">VS</span>
                                                    </div>
                                                    <TeamBlock
                                                        label="Opponents"
                                                        members={opponentTeam.length > 0 ? opponentTeam : [{ username: '?', fullName: 'TBD' }]}
                                                        avgRating={opponentTeam.length > 0 ? avgOf(opponentTeam) : null}
                                                        colorClass={config.color}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 flex-wrap mb-3">
                                                    <div className="flex items-center gap-1.5 bg-gray-800 rounded-full px-3 py-1">
                                                        <div className={`w-5 h-5 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[9px] font-bold`}>
                                                            {m.sender?.username?.[0]?.toUpperCase()}
                                                        </div>
                                                        <span className="text-gray-300 text-xs">{m.sender?.username}</span>
                                                    </div>
                                                    {parts.length > 0 && <span className="text-gray-600 text-xs font-bold">vs</span>}
                                                    {parts.map(p => (
                                                        <div key={p.id} className="flex items-center gap-1.5 bg-gray-800 rounded-full px-3 py-1">
                                                            <div className={`w-5 h-5 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[9px] font-bold`}>
                                                                {p.username?.[0]?.toUpperCase()}
                                                            </div>
                                                            <span className="text-gray-300 text-xs">{p.username}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Location */}
                                            {(m.courtName || m.location) && (
                                                <p className="text-gray-400 text-xs mb-2">
                                                    {m.courtName ? `🏟️ ${m.courtName}${m.courtAddress ? ` — ${m.courtAddress}` : ''}` : `📍 ${m.location}`}
                                                </p>
                                            )}

                                            {/* Message */}
                                            {m.message && (
                                                <p className="text-gray-500 text-xs italic mb-2 line-clamp-2">"{m.message}"</p>
                                            )}

                                            {/* Actions */}
                                            {isPastCard && involved && m.matchType !== 'PLAYER_WANTED' && (
                                                <ExtendOrScore
                                                    match={m}
                                                    config={config}
                                                    onScore={() => setScoringMatch(m)}
                                                    onExtended={(updated) => setUpcomingMatches(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r))}
                                                />
                                            )}
                                            {!isPastCard && m.senderId === myId && (
                                                <button onClick={() => handleCancel(m.id)}
                                                    className="mt-1 w-full bg-red-600/10 hover:bg-red-600/30 border border-red-500/30 text-red-400 font-bold py-2 rounded-xl text-xs transition">
                                                    {t('rival.cancel')} Match
                                                </button>
                                            )}

                                            {/* Comments */}
                                            <button onClick={toggleComments}
                                                className="mt-2 text-gray-400 hover:text-white text-xs font-bold transition">
                                                💬 Comments{matchComments.length > 0 ? ` (${matchComments.length})` : ''} {showComments ? '▲' : '▼'}
                                            </button>
                                            {showComments && (
                                                <div className="mt-2 space-y-2">
                                                    {matchComments.length === 0 ? (
                                                        <p className="text-gray-500 text-xs text-center py-2">No comments yet.</p>
                                                    ) : matchComments.map(c => (
                                                        <div key={c.id} className="bg-gray-800/60 rounded-lg px-3 py-2">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <p className="text-purple-300 text-[11px] font-bold">@{c.user?.username}</p>
                                                                    <p className="text-gray-200 text-xs mt-0.5">{c.content}</p>
                                                                </div>
                                                                {(c.userId === myId || m.senderId === myId) && (
                                                                    <button onClick={() => deleteMatchComment(c.id)} className="text-red-500/70 hover:text-red-400 text-xs flex-shrink-0">✕</button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div className="flex items-center gap-2">
                                                        <input value={commentInput} onChange={e => setCommentInput(e.target.value)}
                                                            onKeyDown={e => e.key === 'Enter' && sendMatchComment()}
                                                            placeholder="Write a comment..."
                                                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500" />
                                                        <button onClick={sendMatchComment} disabled={commentSending}
                                                            className={`bg-gradient-to-r ${config.color} text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50`}>
                                                            Send
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                };

                                return (
                                    <>
                                        {/* ── UPCOMING MATCHES (future) ── */}
                                        {future.length > 0 && (
                                            <div className="mt-2">
                                                <h4 className="text-white font-bold mb-3">📅 {t('rival.upcoming')}</h4>
                                                {future.map(m => <UpcomingCard key={m.id} m={m} />)}
                                            </div>
                                        )}

                                        {/* ── Pending score confirmation ── */}
                                        {completedMatches.length > 0 && (
                                            <div className="mt-4 space-y-3">
                                                {completedMatches.map(match => {
                                                    const participants = Array.isArray(match.participants) ? match.participants : [];
                                                    const senderTeamArr = Array.isArray(match.senderTeam) ? match.senderTeam : [];
                                                    const score = match.score;
                                                    const iAmTeamA = match.senderId === myId || senderTeamArr.some(m => m.id === myId);
                                                    const iAmTeamB = participants.some(p => p.id === myId);
                                                    const isInvolved = iAmTeamA || iAmTeamB;
                                                    const teamA_ids = new Set([match.senderId, ...senderTeamArr.map(m => m.id)]);
                                                    const scorerIsTeamA = teamA_ids.has(match.scoreEnteredBy);
                                                    const mySideScored = (iAmTeamA && scorerIsTeamA) || (iAmTeamB && !scorerIsTeamA);
                                                    const canConfirm = score && match.scoreStatus === 'PENDING' && isInvolved && !mySideScored;
                                                    const isDisputed = match.scoreStatus === 'DISPUTED';
                                                    return (
                                                        <div key={match.id} className={`rounded-2xl p-4 border ${isDisputed ? 'bg-red-500/5 border-red-500/30' : 'bg-gray-900 border-gray-700'}`}>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-gray-400 text-xs font-bold">
                                                                    {match.matchType === 'DOUBLE' ? '2v2' : '1v1'}
                                                                    {match.matchMode === 'COMPETITIVE' && <span className="ml-1 text-red-400 font-bold"> ⚔️ Ranked</span>}
                                                                    {match.completedAt && ` · ${new Date(match.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                                                                </span>
                                                                {isDisputed
                                                                    ? <span className="text-red-400 text-xs font-bold bg-red-500/10 px-2 py-0.5 rounded-full">⚠️ Disputed</span>
                                                                    : <span className="text-yellow-400 text-xs font-bold bg-yellow-500/10 px-2 py-0.5 rounded-full">⏳ Awaiting confirmation</span>
                                                                }
                                                            </div>
                                                            {score && <ScoreDisplay score={score} match={match} participants={participants} config={config} />}
                                                            <div className="mt-3 space-y-2">
                                                                {!score && isInvolved && match.matchType !== 'PLAYER_WANTED' && (
                                                                    <ExtendOrScore
                                                                        match={match}
                                                                        config={config}
                                                                        onScore={() => setScoringMatch(match)}
                                                                        onExtended={(updated) => setCompletedMatches(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r))}
                                                                    />
                                                                )}
                                                                {score && match.scoreStatus === 'PENDING' && mySideScored && (
                                                                    <div className="flex gap-2">
                                                                        <div className="flex-1 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-bold py-2 rounded-xl text-center">
                                                                            ⏳ Waiting for opponent to confirm
                                                                        </div>
                                                                        <button onClick={() => setScoringMatch(match)} className="bg-gray-700 text-gray-300 text-xs font-bold px-3 py-2 rounded-xl hover:bg-gray-600 transition">✏️</button>
                                                                    </div>
                                                                )}
                                                                {canConfirm && (
                                                                    <div className="flex gap-2">
                                                                        <button onClick={async () => {
                                                                            const { data } = await api.patch(`/rivals/${match.id}/confirm-score`);
                                                                            setCompletedMatches(prev => prev.filter(m => m.id !== match.id));
                                                                            setArchivedMatches(prev => [data, ...prev]);
                                                                        }} className="flex-1 bg-green-600/80 hover:bg-green-600 text-white font-bold py-2 rounded-xl text-sm transition">
                                                                            ✓ Confirm Score
                                                                        </button>
                                                                        <button onClick={async () => {
                                                                            await api.patch(`/rivals/${match.id}/dispute-score`);
                                                                            setCompletedMatches(prev => prev.map(m => m.id === match.id ? { ...m, scoreStatus: 'DISPUTED' } : m));
                                                                        }} className="flex-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 font-bold py-2 rounded-xl text-sm transition">
                                                                            ✕ Dispute
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {isDisputed && isInvolved && (
                                                                    <button onClick={async () => {
                                                                        await api.post(`/rivals/${match.id}/report-dispute`, { reason: 'Score disagreement' });
                                                                        alert('📋 Report filed. An admin will review.');
                                                                    }} className="w-full bg-red-600/10 border border-red-500/30 text-red-400 font-bold py-2 rounded-xl text-sm hover:bg-red-600/20 transition">
                                                                        📋 Report to Admin
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {/* PLAYER WANTED TAB — volleyball only */}
                    {activeTab === 'player_wanted' && TEAM_SPORTS.has(sub) && (
                        <PlayerWantedTab
                            config={config} categoryUpper={categoryUpper} sub={sub} myId={myId}
                            posts={playerWantedPosts.filter(p => !Array.isArray(p.positions) || (!p.positions.includes('REFEREE') && !p.positions.includes('REFEREE_OFFER')))} setPosts={setPlayerWantedPosts}
                            onMatchFull={(match) => {
                                setPlayerWantedPosts(prev => prev.filter(p => p.id !== match.id));
                                setUpcomingMatches(prev => {
                                    const exists = prev.some(r => r.id === match.id);
                                    return exists ? prev.map(r => r.id === match.id ? match : r) : [...prev, match];
                                });
                            }}
                        />
                    )}

                    {/* WELLNESS EVENTS TAB */}
                    {activeTab === 'events' && isWellness && (
                        <WellnessEventsTab config={config} sub={sub} categoryUpper={categoryUpper} />
                    )}

                    {/* TOURNAMENTS TAB */}
                    {activeTab === 'tournaments' && (() => {

                        const TOURN_RULES = { '1': t('tournament.rules1'), '2': t('tournament.rules2'), '3': t('tournament.rules3'), '4': t('tournament.rules4') };
                        const TOURN_TYPE_NAME = { '1': t('tournament.type1'), '2': t('tournament.type2'), '3': t('tournament.type3'), '4': t('tournament.type4') };

                        if (rulesOpen) return (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
                                onClick={() => setRulesOpen(false)}>
                                <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[80vh] overflow-y-auto"
                                    onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-white font-bold text-base">📋 {TOURN_TYPE_NAME[rulesOpen] || ''}</p>
                                        <button onClick={() => setRulesOpen(false)} className="text-gray-500 hover:text-white text-lg transition flex-shrink-0">✕</button>
                                    </div>
                                    <div className="space-y-3">
                                        {(TOURN_RULES[rulesOpen] || '').split('\n\n').filter(Boolean).map((para, i) => (
                                            <p key={i} className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">{para}</p>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );

                        const TOURNAMENT_TYPES = [
                            { id: '1', label: t('tournament.type1'), emoji: '🏆', desc: t('tournament.type1_desc') },
                            { id: '2', label: t('tournament.type2'), emoji: '👬', desc: t('tournament.type2_desc') },
                        ];
                        const POLL_TYPE_OPTIONS = ['1','2','3','4','5','6','7','8'].map(id => ({
                            id,
                            label: TYPE_LABEL[id] || `🏅 ${t('tournament.type_generic', { n: id, defaultValue: `Type ${id}` })}`,
                        }));
                        const togglePollType = (id) => setPollTypes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

                        const generateBracket = () => {
                            // Accept any player with at least one name field (covers single-word usernames → lastName = "")
                            let filled = mixPlayers.filter(p => (p.firstName + p.lastName).trim().length > 0);
                            if (filled.length < 4) { alert('Need at least 4 players to start.'); return; }
                            // Trim to even number so all players can be paired
                            if (filled.length % 2 !== 0) filled = filled.slice(0, filled.length - 1);

                            // Gender-aware random pairing: avoid both-female pairs when possible
                            const shuffled = [...filled].sort(() => Math.random() - 0.5);
                            const females = shuffled.filter(p => p.gender === 'F');
                            const others  = shuffled.filter(p => p.gender !== 'F');
                            const fPool = [...females];
                            const oPool = [...others];
                            const teams = [];

                            while (fPool.length > 0 && oPool.length > 0) {
                                const f = fPool.shift();
                                const oi = Math.floor(Math.random() * oPool.length);
                                teams.push({ id: teams.length, p1: f, p2: oPool.splice(oi, 1)[0] });
                            }
                            const remaining = [...fPool, ...oPool];
                            for (let i = 0; i < remaining.length; i += 2) {
                                if (i + 1 < remaining.length)
                                    teams.push({ id: teams.length, p1: remaining[i], p2: remaining[i + 1] });
                            }

                            // Build 3-round schedule: each team plays exactly 3 matches
                            // Round 1, 2, 3: shuffle teams and pair them (odd team count → last team gets bye)
                            const matches = [];
                            for (let round = 1; round <= 3; round++) {
                                const order = [...teams].sort(() => Math.random() - 0.5);
                                for (let i = 0; i + 1 < order.length; i += 2) {
                                    matches.push({
                                        id: `R${round}M${Math.floor(i / 2) + 1}`,
                                        round,
                                        t1: order[i].id, t2: order[i + 1].id,
                                        sets: [{ t1: '', t2: '' }], winner: null, played: false,
                                    });
                                }
                            }

                            const newBracket = { teams, matches, phase: 'league', final: null };
                            setBracket(newBracket);
                            if (managingTournament?.id) {
                                setBracketTournamentId(managingTournament.id);
                                localStorage.setItem(`bracket_${managingTournament.id}`, JSON.stringify(newBracket));
                                localStorage.setItem(`bracket_players_${managingTournament.id}`, JSON.stringify(mixPlayers));
                            }
                        };

                        const handleCreateTournament = async () => {
                            if (!newTournamentName.trim()) { alert('Enter a tournament name'); return; }
                            if (!newTournamentRegDate) { alert(t('tournament.reg_deadline')); return; }
                            if (pollEnabled) {
                                if (!pollEndDate) { alert(t('tournament.poll_end_label', { defaultValue: 'Anket Bitiş Tarihi' })); return; }
                                if (pollTypes.length < 2) { alert(t('tournament.poll_types_min', { defaultValue: 'Anket için en az 2 tür seçmelisiniz.' })); return; }
                            }
                            try {
                                const { data } = await api.post('/tournaments', {
                                    name: newTournamentName.trim(),
                                    type: pollEnabled ? undefined : selectedTournamentType,
                                    pollEnabled,
                                    ...(pollEnabled && { pollEndDate: pollEndDate || undefined, pollEndTime: pollEndTime || undefined, pollTypes }),
                                    category: categoryUpper,
                                    subCategory: sub,
                                    genderType: newTournamentGenderType,
                                    minPlayers: newTournamentMinPlayers ? parseInt(newTournamentMinPlayers) : undefined,
                                    maxPlayers: newTournamentMaxPlayers ? parseInt(newTournamentMaxPlayers) : 32,
                                    location: newTournamentLocation.trim() || undefined,
                                    surface: newTournamentSurface || undefined,
                                    isIndoor: newTournamentIsIndoor ?? undefined,
                                    eventDate: newTournamentDate || undefined,
                                    eventTime: newTournamentTime || undefined,
                                    eventEndDate: newTournamentEndDate || undefined,
                                    eventEndTime: newTournamentEndTime || undefined,
                                    endDate: newTournamentRegDate || undefined,
                                    endTime: newTournamentRegTime || undefined,
                                });
                                setTournaments(prev => [data, ...prev]);
                                setNewTournamentName('');
                                setNewTournamentLocation('');
                                setNewTournamentSurface('');
                                setNewTournamentIsIndoor(null);
                                setNewTournamentDate('');
                                setNewTournamentTime('');
                                setNewTournamentEndDate('');
                                setNewTournamentEndTime('');
                                setNewTournamentRegDate('');
                                setNewTournamentRegTime('');
                                setNewTournamentMinPlayers('');
                                setNewTournamentMaxPlayers('');
                                setNewTournamentGenderType('MIX');
                                setSelectedTournamentType(null);
                                setPollEnabled(false);
                                setPollTypes([]);
                                setPollEndDate('');
                                setPollEndTime('');
                                setTournamentView(null);
                            } catch (e) { alert(e?.response?.data?.message || 'Error'); }
                        };

                        const handleJoin = async (tournamentId) => {
                            try {
                                await api.post(`/tournaments/${tournamentId}/join`);
                                setTournaments(prev => prev.map(t =>
                                    t.id === tournamentId ? { ...t, _myRequest: 'PENDING', _count: { participants: (t._count?.participants || 0) + 1 } } : t
                                ));
                            } catch (e) { alert(e?.response?.data?.message || 'Error'); }
                        };

                        const castVoteType = async (tournamentId, type) => {
                            setVotingTournamentId(tournamentId);
                            try {
                                await api.post(`/tournaments/${tournamentId}/vote-type`, { type });
                            } catch (e) { alert(e?.response?.data?.message || 'Error'); }
                            finally { setVotingTournamentId(null); }
                        };
                        const handleVoteType = (tournamentId, type) => {
                            const label = TYPE_LABEL[type] || `🏅 Type ${type}`;
                            if (!confirm(t('tournament.vote_confirm', { type: label, defaultValue: `${label} türüne oy veriyorsunuz. Bu tür kazanırsa turnuvaya oy sıranıza göre otomatik başvurmuş olacaksınız. Devam edilsin mi?` }))) return;
                            castVoteType(tournamentId, type);
                        };

                        const openManage = async (tournament) => {
                            setManagingTournament(tournament);
                            setTournamentView('manage');
                            try {
                                const { data } = await api.get(`/tournaments/${tournament.id}/requests`);
                                setJoinRequests(prev => ({ ...prev, [tournament.id]: data }));
                            } catch { setJoinRequests(prev => ({ ...prev, [tournament.id]: [] })); }
                        };

                        /* ── NULL: Tournament list ── */
                        if (tournamentView === null) return (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-white font-bold">🏆 {t('tournament.title')}</h3>
                                        <CityAlertBtn tab="tournaments" desc="Şehrinde yeni turnuva açılınca bildirim al" />
                                    </div>
                                    <button onClick={() => setTournamentView('pick')}
                                        className={`bg-gradient-to-r ${config.color} text-white font-bold px-4 py-2 rounded-xl text-sm hover:opacity-90 transition`}>
                                        + {t('tournament.create')}
                                    </button>
                                </div>
                                {tournaments.length === 0 ? (
                                    <div className="text-center py-12 bg-gray-900 rounded-2xl border border-gray-800">
                                        <p className="text-4xl mb-3">🏆</p>
                                        <p className="text-gray-400 text-sm">{t('tournament.no_tournaments')}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {tournaments.map(t => {
                                            const isOwn = t.creatorId === myId;
                                            const isExpanded = expandedTournament === t.id;
                                            return (
                                                <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                                                    {/* Card header */}
                                                    <div className="p-4">
                                                        <div className="flex items-start gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                                    <span className="text-white font-bold text-sm">{t.name}</span>
                                                                    <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                                                                        {t.status === 'POLL' ? '🗳️ Poll' : (TYPE_LABEL[t.type] || t.type)}
                                                                    </span>
                                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${t.status === 'OPEN' ? 'bg-green-500/20 text-green-400' : t.status === 'POLL' ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-700 text-gray-500'}`}>
                                                                        {t.status === 'OPEN' ? '🟢 Open' : t.status === 'POLL' ? '🗳️ Poll' : t.status}
                                                                    </span>
                                                                    {t.status !== 'POLL' && (
                                                                        <button onClick={() => setRulesOpen(t.type)}
                                                                            className="text-[10px] text-purple-400 hover:text-purple-300 underline underline-offset-2 transition">
                                                                            Rules
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <p className="text-gray-500 text-xs">
                                                                    {(() => {
                                                                        const reqs = joinRequests[t.id];
                                                                        if (reqs) {
                                                                            const acc = reqs.filter(r => r.status === 'ACCEPTED').length;
                                                                            return `${Math.min(acc, t.maxPlayers)}/${t.maxPlayers} participants${acc > t.maxPlayers ? ` · ${acc - t.maxPlayers} reserve` : ''}`;
                                                                        }
                                                                        return `${t._count?.participants || 0}/${t.maxPlayers} participants`;
                                                                    })()}
                                                                </p>
                                                                {/* Details row */}
                                                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                                                                    {t.location  && <span className="text-gray-400 text-[11px]">📍 {t.location}</span>}
                                                                    {t.eventDate && <span className="text-gray-400 text-[11px]">📅 {new Date(t.eventDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}{t.startTime ? ` · ${t.startTime}` : ''}</span>}
                                                                    {t.endDate   && <span className="text-gray-400 text-[11px]">🏁 {new Date(t.endDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}{t.endTime ? ` · ${t.endTime}` : ''}</span>}
                                                                </div>
                                                            </div>
                                                            {/* Action buttons */}
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <button onClick={() => shareTournament(t)}
                                                                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-bold text-xs px-3 py-1.5 rounded-xl transition">
                                                                    📤 Share
                                                                </button>
                                                                {t.status === 'POLL' ? (
                                                                    <div className="flex flex-col items-end gap-1">
                                                                        {(Array.isArray(t.pollTypes) ? t.pollTypes : ['1', '2']).map(tp => {
                                                                            const votes = (t.typeVotes || []).filter(v => v.votedType === tp).length;
                                                                            const voted = (t.typeVotes || []).find(v => v.userId === myId)?.votedType === tp;
                                                                            return (
                                                                                <button key={tp} disabled={votingTournamentId === t.id}
                                                                                    onClick={() => handleVoteType(t.id, tp)}
                                                                                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition whitespace-nowrap ${voted ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-purple-500/50'}`}>
                                                                                    {voted ? '✓ ' : ''}{TYPE_LABEL[tp] || `🏅 Type ${tp}`} · {votes}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                        {t.pollEndDate && (
                                                                            <span className="text-gray-500 text-[10px]">
                                                                                🗳️ {new Date(t.pollEndDate).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}{t.pollEndTime ? ` ${t.pollEndTime}` : ''}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ) : isOwn ? (
                                                                    <button onClick={() => openManage(t)}
                                                                        className="bg-purple-600/20 border border-purple-500/40 text-purple-300 font-bold text-xs px-3 py-1.5 rounded-xl hover:bg-purple-600/40 transition">
                                                                        Manage
                                                                    </button>
                                                                ) : t._myRequest ? (() => {
                                                                    const hoursLeft = t.eventDate ? (new Date(t.eventDate) - Date.now()) / 3600000 : Infinity;
                                                                    const canSelfCancel = hoursLeft > 24;
                                                                    if (t._myRequest === 'REJECTED') {
                                                                        return <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400">✗ Rejected</span>;
                                                                    }
                                                                    return (
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className={`text-xs font-bold px-3 py-1.5 rounded-xl ${t._myRequest === 'ACCEPTED' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                                                                                {t._myRequest === 'ACCEPTED' ? '✓ Accepted' : '⏳ Pending'}
                                                                            </span>
                                                                            {canSelfCancel ? (
                                                                                <button onClick={async () => {
                                                                                    if (!confirm('Cancel your registration?')) return;
                                                                                    try {
                                                                                        await api.delete(`/tournaments/${t.id}/join`);
                                                                                        setTournaments(prev => prev.map(x => x.id === t.id ? { ...x, _myRequest: null } : x));
                                                                                    } catch (e) { alert(e?.response?.data?.message || 'Error'); }
                                                                                }} className="text-red-400/70 hover:text-red-400 text-[10px] font-bold border border-red-500/20 hover:border-red-500/40 px-2 py-1.5 rounded-xl transition">
                                                                                    ✕ Cancel
                                                                                </button>
                                                                            ) : (
                                                                                <button onClick={async () => {
                                                                                    if (!confirm('Less than 24h before tournament. Send cancellation request to creator?')) return;
                                                                                    try {
                                                                                        await api.post(`/tournaments/${t.id}/cancel-request`);
                                                                                        alert('Cancellation request sent to creator/admin.');
                                                                                    } catch (e) { alert(e?.response?.data?.message || 'Error'); }
                                                                                }} className="text-orange-400/70 hover:text-orange-400 text-[10px] font-bold border border-orange-500/20 hover:border-orange-500/40 px-2 py-1.5 rounded-xl transition">
                                                                                    ⚠️ Request
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })() : (
                                                                    <button onClick={() => handleJoin(t.id)}
                                                                        className={`bg-gradient-to-r ${config.color} text-white font-bold text-xs px-3 py-1.5 rounded-xl hover:opacity-90 transition`}>
                                                                        Join
                                                                    </button>
                                                                )}
                                                                {/* Expand arrow */}
                                                                <button onClick={async () => {
                                                                    if (!isExpanded) {
                                                                        setExpandedTournament(t.id);
                                                                        // Auto-resume bracket if saved
                                                                        const savedBracket = t.type === 'mix_double' && t.creatorId === myId ? localStorage.getItem(`bracket_${t.id}`) : null;
                                                                        if (savedBracket) {
                                                                            const parsed = JSON.parse(savedBracket);
                                                                            if (parsed.matches) {
                                                                                parsed.matches = parsed.matches.map(m => m.sets ? m : { ...m, sets: [{ t1: m.s1 || '', t2: m.s2 || '' }], winner: null });
                                                                            }
                                                                            if (parsed.final && !parsed.final.sets) {
                                                                                parsed.final = { ...parsed.final, sets: [{ t1: parsed.final.s1 || '', t2: parsed.final.s2 || '' }], winner: parsed.final.winner ?? null };
                                                                            }
                                                                            const savedPlayers = localStorage.getItem(`bracket_players_${t.id}`);
                                                                            setManagingTournament(t);
                                                                            setBracketTournamentId(t.id);
                                                                            setBracket(parsed);
                                                                            if (savedPlayers) setMixPlayers(JSON.parse(savedPlayers));
                                                                            setTournamentView('mix_double');
                                                                            return;
                                                                        }
                                                                        try {
                                                                            const { data } = await api.get(`/tournaments/${t.id}/requests`);
                                                                            setJoinRequests(prev => ({ ...prev, [t.id]: data }));
                                                                        } catch { setJoinRequests(prev => ({ ...prev, [t.id]: [] })); }
                                                                    } else {
                                                                        setExpandedTournament(null);
                                                                    }
                                                                }} className="w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition text-sm font-bold">
                                                                    {isExpanded ? '↓' : localStorage.getItem(`bracket_${t.id}`) && t.creatorId === myId ? '▶' : '→'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Expanded: accepted participants + reserve + rejected + start */}
                                                    {isExpanded && (() => {
                                                        const allReqs = joinRequests[t.id] || [];
                                                        const accepted = allReqs.filter(r => r.status === 'ACCEPTED');
                                                        const rejected = allReqs.filter(r => r.status === 'REJECTED');
                                                        const main    = accepted.slice(0, t.maxPlayers);
                                                        const reserve = accepted.slice(t.maxPlayers);
                                                        const emptyCount = Math.max(0, t.maxPlayers - main.length);

                                                        const removeMain = async (r) => {
                                                            await handleRequestAction(t.id, r.user.id, 'REJECTED');
                                                        };

                                                        return (
                                                            <div className="border-t border-gray-800 bg-gray-950 px-4 py-3 space-y-3">
                                                                {/* Main slots */}
                                                                <div>
                                                                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide mb-2">Participants ({main.length}/{t.maxPlayers})</p>
                                                                    {(t.type === '2' || t.type === '4') ? (() => {
                                                                        const { pairs, solos, byUserId } = groupDoublesPairs(main);
                                                                        return (
                                                                            <div className="grid grid-cols-2 gap-1.5">
                                                                                {pairs.map(([p1, p2]) => renderTournamentDuoCard(t.id, p1, p2, solos, byUserId, false))}
                                                                                {solos.filter(s => !pairs.some(([p1, p2]) => p1.id === s.id || p2.id === s.id)).map(s => renderTournamentDuoCard(t.id, s, null, solos, byUserId, false))}
                                                                            </div>
                                                                        );
                                                                    })() : (
                                                                        <div className="grid grid-cols-2 gap-1.5">
                                                                            {main.map((r, idx) => (
                                                                                <div key={r.id} className="flex items-center gap-2 bg-gray-900 rounded-xl px-3 py-2">
                                                                                    <span className="text-gray-600 text-[10px] font-mono w-5">{idx + 1}</span>
                                                                                    <div className="w-5 h-5 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white text-[9px] font-black flex-shrink-0">
                                                                                        {r.user?.fullName?.[0]?.toUpperCase() || r.user?.username?.[0]?.toUpperCase()}
                                                                                    </div>
                                                                                    <span className="text-gray-300 text-xs truncate flex-1">{r.user?.fullName || r.user?.username}</span>
                                                                                    {isOwn ? (
                                                                                        <button onClick={() => removeMain(r)}
                                                                                            className="text-red-500/60 hover:text-red-400 text-xs flex-shrink-0 transition">✕</button>
                                                                                    ) : (
                                                                                        <span className="text-green-400 text-[9px] font-bold">✓</span>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                            {Array.from({ length: emptyCount }).map((_, i) => (
                                                                                <div key={`empty-${i}`} className="flex items-center gap-2 bg-gray-900/30 rounded-xl px-3 py-2 border border-dashed border-gray-800">
                                                                                    <span className="text-gray-700 text-[10px] font-mono w-5">{main.length + i + 1}</span>
                                                                                    <span className="text-gray-700 text-xs">Empty slot</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {/* Reserve */}
                                                                {reserve.length > 0 && (
                                                                    <div>
                                                                        <p className="text-yellow-500/70 text-[10px] font-bold uppercase tracking-wide mb-2">Reserve ({reserve.length})</p>
                                                                        <div className="grid grid-cols-2 gap-1.5">
                                                                            {reserve.map((r, idx) => (
                                                                                <div key={r.id} className="flex items-center gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3 py-2">
                                                                                    <span className="text-yellow-600 text-[10px] font-bold w-5">R{idx + 1}</span>
                                                                                    <div className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-300 text-[9px] font-black flex-shrink-0">
                                                                                        {r.user?.fullName?.[0]?.toUpperCase() || r.user?.username?.[0]?.toUpperCase()}
                                                                                    </div>
                                                                                    <span className="text-gray-400 text-xs truncate flex-1">{r.user?.fullName || r.user?.username}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {/* Rejected */}
                                                                {rejected.length > 0 && (
                                                                    <div>
                                                                        <p className="text-red-500/70 text-[10px] font-bold uppercase tracking-wide mb-2">Rejected ({rejected.length})</p>
                                                                        <div className="grid grid-cols-2 gap-1.5">
                                                                            {rejected.map((r) => (
                                                                                <div key={r.id} className="flex items-center gap-2 bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2">
                                                                                    <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center text-red-300 text-[9px] font-black flex-shrink-0">
                                                                                        {r.user?.fullName?.[0]?.toUpperCase() || r.user?.username?.[0]?.toUpperCase()}
                                                                                    </div>
                                                                                    <span className="text-gray-500 text-xs truncate flex-1">{r.user?.fullName || r.user?.username}</span>
                                                                                    <span className="text-red-400 text-[9px] font-bold">✗</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {/* Real tournament types ('1'/'2'/'3'/'4'): Start + Matches buttons */}
                                                                {(t.type === '1' || t.type === '2' || t.type === '3' || t.type === '4') && (
                                                                    <div className="flex gap-2">
                                                                        {isOwn && t.status === 'OPEN' && (
                                                                            <button onClick={() => handleStartTournament(t)} disabled={matchActionLoading || main.length < (t.minPlayers || 2)}
                                                                                className={`flex-1 bg-gradient-to-r ${config.color} text-white font-bold py-2 rounded-xl text-sm hover:opacity-90 transition disabled:opacity-40`}>
                                                                                🚀 {t('tournament.start')}
                                                                            </button>
                                                                        )}
                                                                        {(t.status === 'IN_PROGRESS' || t.status === 'COMPLETED') && (
                                                                            <button onClick={() => openMatchesModal(t)}
                                                                                className="flex-1 bg-purple-600/20 border border-purple-500/40 text-purple-300 font-bold py-2 rounded-xl text-sm hover:bg-purple-600/30 transition">
                                                                                📅 {t('tournament.bracket')}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {/* Archive button — creator only, when bracket is done in localStorage */}
                                                                {isOwn && t.type === 'mix_double' && (() => {
                                                                    const rawSaved = localStorage.getItem(`bracket_${t.id}`);
                                                                    if (!rawSaved) return null;
                                                                    try {
                                                                        const parsed = JSON.parse(rawSaved);
                                                                        if (parsed.phase !== 'done' || parsed.final?.winner == null) return null;
                                                                        const winTeam = parsed.teams?.find(tm => tm.id === parsed.final.winner);
                                                                        const winName = winTeam ? `${winTeam.p1?.firstName || ''}/${winTeam.p2?.firstName || ''}` : '?';
                                                                        return (
                                                                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-3 space-y-2">
                                                                                <p className="text-yellow-400 font-bold text-xs text-center">🏆 Champion: {winName}</p>
                                                                                <button onClick={async () => {
                                                                                    if (!confirm('Archive this tournament? It will be saved permanently and removed from active view.')) return;
                                                                                    try {
                                                                                        let bracketToSave = parsed;
                                                                                        if (bracketToSave.matches) {
                                                                                            bracketToSave.matches = bracketToSave.matches.map(m => m.sets ? m : { ...m, sets: [{ t1: m.s1 || '', t2: m.s2 || '' }], winner: null });
                                                                                        }
                                                                                        await api.post(`/tournaments/${t.id}/complete`, { bracketData: bracketToSave });
                                                                                        localStorage.removeItem(`bracket_${t.id}`);
                                                                                        localStorage.removeItem(`bracket_players_${t.id}`);
                                                                                        setBracket(null);
                                                                                        setBracketTournamentId(null);
                                                                                        setManagingTournament(null);
                                                                                        setExpandedTournament(null);
                                                                                        setTournaments(prev => prev.filter(tx => tx.id !== t.id));
                                                                                    } catch (e) { alert(e?.response?.data?.message || 'Error archiving'); }
                                                                                }} className="w-full bg-green-600/80 hover:bg-green-600 text-white font-bold py-2 rounded-xl text-sm transition">
                                                                                    📦 Archive Tournament
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    } catch { return null; }
                                                                })()}

                                                                {/* Start Tournament — creator only, mix_double */}
                                                                {isOwn && t.type === 'mix_double' && !((() => { try { const p = JSON.parse(localStorage.getItem(`bracket_${t.id}`) || 'null'); return p?.phase === 'done' && p?.final?.winner != null; } catch { return false; } })()) && (
                                                                    <button
                                                                        onClick={async () => {
                                                                            setManagingTournament(t);
                                                                            setBracketTournamentId(t.id);

                                                                            // If bracket already in memory for this tournament, just jump back
                                                                            if (bracket && bracketTournamentId === t.id) {
                                                                                setTournamentView('mix_double');
                                                                                return;
                                                                            }

                                                                            // Restore saved bracket if it exists
                                                                            const savedBracket  = localStorage.getItem(`bracket_${t.id}`);
                                                                            const savedPlayers  = localStorage.getItem(`bracket_players_${t.id}`);
                                                                            if (savedBracket) {
                                                                                const parsed = JSON.parse(savedBracket);
                                                                                // Migrate old s1/s2 format to sets array
                                                                                if (parsed.matches) {
                                                                                    parsed.matches = parsed.matches.map(m => m.sets ? m : {
                                                                                        ...m,
                                                                                        sets: [{ t1: m.s1 || '', t2: m.s2 || '' }],
                                                                                        winner: null,
                                                                                    });
                                                                                }
                                                                                if (parsed.final && !parsed.final.sets) {
                                                                                    parsed.final = { ...parsed.final, sets: [{ t1: parsed.final.s1 || '', t2: parsed.final.s2 || '' }], winner: parsed.final.winner ?? null };
                                                                                }
                                                                                setBracket(parsed);
                                                                                if (savedPlayers) setMixPlayers(JSON.parse(savedPlayers));
                                                                                setTournamentView('mix_double');
                                                                                return;
                                                                            }

                                                                            // No saved bracket — fresh start: load latest accepted list
                                                                            let latestAccepted = accepted;
                                                                            try {
                                                                                const { data } = await api.get(`/tournaments/${t.id}/requests`);
                                                                                setJoinRequests(prev => ({ ...prev, [t.id]: data }));
                                                                                latestAccepted = data.filter(r => r.status === 'ACCEPTED');
                                                                            } catch { /* fall back to local state */ }

                                                                            const filled = latestAccepted.slice(0, 32).map((r, i) => {
                                                                                const raw = (r.user?.fullName || r.user?.username || '').trim();
                                                                                const parts = raw.split(/\s+/);
                                                                                const firstName = parts[0] || '';
                                                                                const lastName  = parts.slice(1).join(' ');
                                                                                return { id: i, firstName, lastName, gender: r.user?.gender === 'FEMALE' ? 'F' : r.user?.gender === 'OTHER' ? 'O' : 'M', paid: true };
                                                                            });
                                                                            while (filled.length < 32) filled.push({ id: filled.length, firstName: '', lastName: '', gender: 'M', paid: false });
                                                                            setMixPlayers(filled);
                                                                            setBracket(null);
                                                                            setTournamentView('mix_double');
                                                                        }}
                                                                        className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-3 rounded-2xl text-sm hover:opacity-90 transition mt-1`}>
                                                                        {(bracket && bracketTournamentId === t.id) || localStorage.getItem(`bracket_${t.id}`) ? '▶ Resume Tournament' : `🏆 Start Tournament (${main.length} players ready)`}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );

                        /* ── PICK: Choose type ── */
                        if (tournamentView === 'pick') return (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setTournamentView(null)} className="text-gray-400 hover:text-white text-xl transition">←</button>
                                    <h3 className="text-white font-bold">Create Tournament</h3>
                                </div>

                                <div className="flex gap-2">
                                    <button type="button" onClick={() => { setPollEnabled(false); setPollTypes([]); }}
                                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border transition ${!pollEnabled ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'}`}>
                                        {t('tournament.poll_choose_myself', { defaultValue: '🎯 Türü ben seçeyim' })}
                                    </button>
                                    <button type="button" onClick={() => { setPollEnabled(true); setSelectedTournamentType(null); }}
                                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border transition ${pollEnabled ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'}`}>
                                        {t('tournament.poll_let_vote', { defaultValue: '🗳️ Oylamaya bırakayım' })}
                                    </button>
                                </div>

                                {!pollEnabled ? (
                                    <>
                                        <p className="text-gray-500 text-sm">Select a tournament type:</p>
                                        <div className="space-y-3">
                                            {TOURNAMENT_TYPES.map(t => (
                                                <button key={t.id} onClick={() => { setSelectedTournamentType(t.id); setTournamentView('name_entry'); }}
                                                    className="w-full bg-gray-900 border border-gray-800 hover:border-purple-500/50 rounded-2xl p-4 flex items-center gap-3 transition text-left">
                                                    <span className="text-2xl">{t.emoji}</span>
                                                    <div>
                                                        <p className="text-white font-bold text-sm">{t.label}</p>
                                                        <p className="text-gray-500 text-xs">{t.desc}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-gray-500 text-sm">{t('tournament.poll_types_label', { defaultValue: 'Oylamaya sunulacak türleri seçin (en az 2):' })}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {POLL_TYPE_OPTIONS.map(o => (
                                                <button key={o.id} type="button" onClick={() => togglePollType(o.id)}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${pollTypes.includes(o.id) ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'}`}>
                                                    {o.label}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            disabled={pollTypes.length < 2}
                                            onClick={() => setTournamentView('name_entry')}
                                            className={`w-full font-bold py-3 rounded-xl text-sm transition ${pollTypes.length < 2 ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : `bg-gradient-to-r ${config.color} text-white hover:opacity-90`}`}>
                                            {t('common.continue', { defaultValue: 'Devam Et' })}
                                        </button>
                                    </>
                                )}
                            </div>
                        );

                        /* ── NAME ENTRY ── */
                        if (tournamentView === 'name_entry') {
                            const typeInfo = TOURNAMENT_TYPES.find(t => t.id === selectedTournamentType);
                            const inputCls = "w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 placeholder-gray-600";
                            const labelCls = "text-gray-400 text-xs mb-1 block";
                            return (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setTournamentView('pick')} className="text-gray-400 hover:text-white text-xl transition">←</button>
                                        <h3 className="text-white font-bold">
                                            {pollEnabled ? t('tournament.poll_let_vote', { defaultValue: '🗳️ Oylamaya bırakayım' }) : <>{typeInfo?.emoji} {typeInfo?.label}</>}
                                        </h3>
                                    </div>

                                    {/* Rules section */}
                                    {!pollEnabled && (
                                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 max-h-48 overflow-y-auto">
                                            <p className="text-white font-bold text-sm mb-3">📋 Rules</p>
                                            <div className="space-y-2">
                                                {(TOURN_RULES[selectedTournamentType] || '').split('\n\n').filter(Boolean).map((para, i) => (
                                                    <p key={i} className="text-gray-400 text-xs leading-relaxed whitespace-pre-line">{para}</p>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Tournament name */}
                                    <div>
                                        <label className={labelCls}>Tournament Name *</label>
                                        <input value={newTournamentName} onChange={e => setNewTournamentName(e.target.value)}
                                            placeholder="e.g. Summer Cup 2026" className={inputCls} autoFocus />
                                    </div>

                                    {/* Court / venue with autocomplete */}
                                    <CourtAutocomplete
                                        location={newTournamentLocation}
                                        onLocationChange={setNewTournamentLocation}
                                        inputCls={inputCls}
                                        labelCls={labelCls}
                                    />

                                    {/* Surface + Indoor/Outdoor */}
                                    {(() => {
                                        const SURFACES = [
                                            { id: 'clay',       label: 'Clay' },
                                            { id: 'hard',       label: 'Hard' },
                                            { id: 'grass',      label: 'Grass' },
                                            { id: 'carpet',     label: 'Carpet' },
                                            { id: 'sand',       label: 'Sand' },
                                            { id: 'artificial', label: 'Artificial' },
                                        ];
                                        const chipCls = (active) => `px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${active ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'}`;
                                        return (
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <label className="text-gray-400 text-xs w-24 shrink-0">🎾 Surface</label>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {SURFACES.map(s => (
                                                        <button key={s.id} type="button"
                                                            onClick={() => setNewTournamentSurface(prev => prev === s.id ? '' : s.id)}
                                                            className={chipCls(newTournamentSurface === s.id)}>
                                                            {s.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-1.5 ml-6">
                                                    <label className="text-gray-400 text-xs shrink-0">Venue Type</label>
                                                    <button type="button" onClick={() => setNewTournamentIsIndoor(prev => prev === false ? null : false)}
                                                        className={chipCls(newTournamentIsIndoor === false)}>
                                                        ☀️ Outdoor
                                                    </button>
                                                    <button type="button" onClick={() => setNewTournamentIsIndoor(prev => prev === true ? null : true)}
                                                        className={chipCls(newTournamentIsIndoor === true)}>
                                                        🏠 Indoor
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Gender type */}
                                    <div>
                                        <label className={labelCls}>{t('tournament.gender_type')}</label>
                                        <div className="flex gap-1.5">
                                            {[['MIX', t('tournament.gender_mix')], ['MALE', t('tournament.gender_male')], ['FEMALE', t('tournament.gender_female')]].map(([id, lbl]) => (
                                                <button key={id} type="button" onClick={() => setNewTournamentGenderType(id)}
                                                    className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${newTournamentGenderType === id ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'}`}>
                                                    {lbl}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Min / Max players */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className={labelCls}>{t('tournament.min_players')}</label>
                                            <input type="number" min="2" value={newTournamentMinPlayers} onChange={e => setNewTournamentMinPlayers(e.target.value)}
                                                placeholder="4" className={inputCls} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>{t('tournament.max_players')}</label>
                                            <input type="number" min="2" value={newTournamentMaxPlayers} onChange={e => setNewTournamentMaxPlayers(e.target.value)}
                                                placeholder="32" className={inputCls} />
                                        </div>
                                    </div>

                                    {/* Event Start Date · Time / Event End Date · Time */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className={labelCls}>📅 {t('tournament.event_date')}</label>
                                            <input type="date" value={newTournamentDate} onChange={e => setNewTournamentDate(e.target.value)}
                                                onClick={e => e.target.showPicker?.()}
                                                className={inputCls + " [color-scheme:dark] cursor-pointer"} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>🕐 Start Time</label>
                                            <TimeSelect value={newTournamentTime} onChange={setNewTournamentTime} className="w-full" />
                                        </div>
                                        <div>
                                            <label className={labelCls}>📅 Finish Date</label>
                                            <input type="date" value={newTournamentEndDate} onChange={e => setNewTournamentEndDate(e.target.value)}
                                                onClick={e => e.target.showPicker?.()}
                                                className={inputCls + " [color-scheme:dark] cursor-pointer"} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>🕐 Finish Time</label>
                                            <TimeSelect value={newTournamentEndTime} onChange={setNewTournamentEndTime} className="w-full" />
                                        </div>
                                    </div>

                                    {/* Poll end date/time (only when letting players vote) */}
                                    {pollEnabled && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className={labelCls}>🗳️ {t('tournament.poll_end_label', { defaultValue: 'Anket Bitiş Tarihi' })} *</label>
                                                <input type="date" value={pollEndDate} onChange={e => setPollEndDate(e.target.value)}
                                                    onClick={e => e.target.showPicker?.()}
                                                    className={inputCls + " [color-scheme:dark] cursor-pointer"} />
                                            </div>
                                            <div>
                                                <label className={labelCls}>🕐 {t('rival.time')}</label>
                                                <TimeSelect value={pollEndTime} onChange={setPollEndTime} className="w-full" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Registration deadline */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className={labelCls}>⏳ {t('tournament.reg_deadline')} *</label>
                                            <input type="date" value={newTournamentRegDate} onChange={e => setNewTournamentRegDate(e.target.value)}
                                                onClick={e => e.target.showPicker?.()}
                                                className={inputCls + " [color-scheme:dark] cursor-pointer"} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>🕐 {t('rival.time')}</label>
                                            <TimeSelect value={newTournamentRegTime} onChange={setNewTournamentRegTime} className="w-full" />
                                        </div>
                                    </div>

                                    <button onClick={handleCreateTournament}
                                        className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition`}>
                                        🏆 Create & Open Tournament
                                    </button>
                                </div>
                            );
                        }

                        /* ── MANAGE: join requests ── */
                        if (tournamentView === 'manage' && managingTournament) {
                            const manageReqs = joinRequests[managingTournament.id] || [];
                            const pendingReqs = manageReqs.filter(r => r.status === 'PENDING');
                            const MAX = managingTournament.maxPlayers || 32;
                            const acceptedAll = manageReqs.filter(r => r.status === 'ACCEPTED');
                            const mainParticipants = acceptedAll.slice(0, MAX);
                            const reserveList = acceptedAll.slice(MAX);

                            const handleCancel = async () => {
                                if (!window.confirm('Are you sure you want to cancel this tournament? It will be permanently deleted.')) return;
                                try {
                                    if (demoIntervalRef.current) { clearInterval(demoIntervalRef.current); demoIntervalRef.current = null; }
                                    setDemoProgress(null);
                                    await api.delete(`/tournaments/${managingTournament.id}`);
                                    setTournaments(prev => prev.filter(t => t.id !== managingTournament.id));
                                    setTournamentView(null);
                                    setManagingTournament(null);
                                } catch (e) { alert(e?.response?.data?.message || 'Error'); }
                            };

                            const startDemoRequests = () => {
                                if (demoIntervalRef.current) return;
                                const TOTAL = 40;
                                let idx = 0;
                                const tid = managingTournament.id;

                                const sendNext = async () => {
                                    if (idx >= TOTAL) {
                                        clearInterval(demoIntervalRef.current);
                                        demoIntervalRef.current = null;
                                        setDemoProgress(null);
                                        return;
                                    }
                                    try {
                                        const { data } = await api.post('/demo/tournament-join', { tournamentId: tid, playerIndex: idx });
                                        setJoinRequests(prev => ({
                                            ...prev,
                                            [tid]: [...(prev[tid] || []), data.participant],
                                        }));
                                    } catch { /* skip duplicates */ }
                                    idx++;
                                    setDemoProgress({ current: idx, total: TOTAL });
                                };

                                sendNext(); // fire immediately
                                demoIntervalRef.current = setInterval(sendNext, 10000);
                                setDemoProgress({ current: 0, total: TOTAL });
                            };

                            return (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => { setTournamentView(null); setManagingTournament(null); }}
                                            className="text-gray-400 hover:text-white text-xl transition">←</button>
                                        <div className="flex-1">
                                            <h3 className="text-white font-bold">{managingTournament.name}</h3>
                                            <p className="text-gray-500 text-xs">{TYPE_LABEL[managingTournament.type]} · {acceptedAll.length}/{managingTournament.maxPlayers} accepted · {pendingReqs.length} pending</p>
                                        </div>
                                        {/* Demo button */}
                                        {!demoProgress ? (
                                            <button onClick={startDemoRequests}
                                                className="flex-shrink-0 bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 font-bold text-xs px-3 py-1.5 rounded-xl transition">
                                                🤖 Demo
                                            </button>
                                        ) : (
                                            <span className="flex-shrink-0 text-blue-400 text-xs font-bold bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 rounded-xl">
                                                🤖 {demoProgress.current}/{demoProgress.total}
                                            </span>
                                        )}
                                        <button onClick={handleCancel}
                                            className="flex-shrink-0 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-bold text-xs px-3 py-1.5 rounded-xl transition">
                                            ✕ Cancel
                                        </button>
                                    </div>
                                    {pendingReqs.length === 0 ? (
                                        <div className="text-center py-10 bg-gray-900 rounded-2xl border border-gray-800">
                                            <p className="text-3xl mb-2">📭</p>
                                            <p className="text-gray-400 text-sm">No pending requests.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {pendingReqs.map((r, idx) => (
                                                <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 flex items-center gap-3">
                                                    <span className="text-gray-600 text-xs font-mono w-5">{idx + 1}</span>
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                                                        {r.user?.fullName?.[0]?.toUpperCase() || r.user?.username?.[0]?.toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white font-bold text-sm">{r.user?.fullName || r.user?.username}</p>
                                                        <p className="text-gray-500 text-[10px]">
                                                            {new Date(r.createdAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-1.5 flex-shrink-0">
                                                        <button onClick={() => handleRequestAction(managingTournament.id, r.user.id, 'ACCEPTED')}
                                                            className="bg-green-600/80 hover:bg-green-600 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition">✓ Accept</button>
                                                        <button onClick={() => handleRequestAction(managingTournament.id, r.user.id, 'REJECTED')}
                                                            className="bg-red-600/20 border border-red-600/40 text-red-400 font-bold text-xs px-3 py-1.5 rounded-xl transition">✗ Reject</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                </div>
                            );
                        }

                        if (tournamentView === 'mix_double') {
                            const mdTeamById = (id) => bracket?.teams.find(t => t.id === id);
                            const mdTeamName = (id) => { const t = mdTeamById(id); return t ? `${t.p1.firstName}/${t.p2.firstName}` : '?'; };
                            const mdTeamFull = (id) => { const t = mdTeamById(id); return t ? `${t.p1.firstName} ${t.p1.lastName} & ${t.p2.firstName} ${t.p2.lastName}` : '?'; };
                            const mdInpCls   = "w-10 bg-gray-800 border border-gray-700 rounded text-white text-center text-sm py-1 focus:outline-none focus:border-purple-500";

                            const mdSetsWon = (m) => {
                                const sets = m.sets || [];
                                const t1w = sets.filter(s => (parseInt(s.t1) || 0) > (parseInt(s.t2) || 0)).length;
                                const t2w = sets.filter(s => (parseInt(s.t2) || 0) > (parseInt(s.t1) || 0)).length;
                                return { t1w, t2w };
                            };

                            const mdComputeStandings = () => {
                                if (!bracket) return [];
                                const stats = {};
                                bracket.teams.forEach(t => { stats[t.id] = { played: 0, won: 0, lost: 0, gw: 0, gl: 0, pts: 0 }; });
                                bracket.matches.forEach(m => {
                                    if (!m.played) return;
                                    const { t1w, t2w } = mdSetsWon(m);
                                    stats[m.t1].played++; stats[m.t2].played++;
                                    stats[m.t1].gw += t1w; stats[m.t1].gl += t2w;
                                    stats[m.t2].gw += t2w; stats[m.t2].gl += t1w;
                                    const winner = m.winner ?? (t1w > t2w ? m.t1 : t2w > t1w ? m.t2 : null);
                                    if (winner === m.t1)      { stats[m.t1].won++; stats[m.t1].pts += 3; stats[m.t2].lost++; }
                                    else if (winner === m.t2) { stats[m.t2].won++; stats[m.t2].pts += 3; stats[m.t1].lost++; }
                                });
                                return bracket.teams
                                    .map(t => ({ tid: t.id, ...stats[t.id], avg: stats[t.id].played ? (stats[t.id].gw / stats[t.id].played).toFixed(2) : '-' }))
                                    .sort((a, b) => b.pts - a.pts || (b.gw - b.gl) - (a.gw - a.gl) || b.gw - a.gw);
                            };

                            const mdUpdateSet = (matchId, setIdx, side, val) => setBracket(prev => ({
                                ...prev,
                                matches: prev.matches.map(m => m.id !== matchId ? m : {
                                    ...m,
                                    sets: m.sets.map((s, i) => i !== setIdx ? s : { ...s, [side]: val }),
                                }),
                            }));
                            const mdAddSet = (matchId) => setBracket(prev => ({
                                ...prev,
                                matches: prev.matches.map(m => m.id !== matchId ? m : { ...m, sets: [...m.sets, { t1: '', t2: '' }] }),
                            }));
                            const mdRemoveSet = (matchId, setIdx) => setBracket(prev => ({
                                ...prev,
                                matches: prev.matches.map(m => m.id !== matchId ? m : { ...m, sets: m.sets.filter((_, i) => i !== setIdx) }),
                            }));
                            const mdSetWinner = (matchId, winner) => setBracket(prev => ({
                                ...prev,
                                matches: prev.matches.map(m => m.id !== matchId ? m : { ...m, winner }),
                            }));
                            const mdMarkPlayed = (matchId) => setBracket(prev => {
                                const m = prev.matches.find(m => m.id === matchId);
                                const { t1w, t2w } = mdSetsWon(m);
                                const autoWinner = t1w > t2w ? m.t1 : t2w > t1w ? m.t2 : null;
                                return {
                                    ...prev,
                                    matches: prev.matches.map(mx => mx.id !== matchId ? mx : {
                                        ...mx, played: true, winner: mx.winner ?? autoWinner,
                                    }),
                                };
                            });

                            const mdAllDone = bracket ? bracket.matches.every(m => m.played) : false;
                            const mdStandings = mdComputeStandings();

                            const mdStartFinal = () => {
                                const top2 = mdStandings.slice(0, 2);
                                setBracket(prev => ({ ...prev, phase: 'final', final: { t1: top2[0].tid, t2: top2[1].tid, sets: [{ t1: '', t2: '' }], winner: null, played: false } }));
                            };
                            const mdUpdateFinalSet = (setIdx, side, val) => setBracket(prev => ({
                                ...prev,
                                final: { ...prev.final, sets: prev.final.sets.map((s, i) => i !== setIdx ? s : { ...s, [side]: val }) },
                            }));
                            const mdAddFinalSet = () => setBracket(prev => ({
                                ...prev,
                                final: { ...prev.final, sets: [...prev.final.sets, { t1: '', t2: '' }] },
                            }));
                            const mdRemoveFinalSet = (setIdx) => setBracket(prev => ({
                                ...prev,
                                final: { ...prev.final, sets: prev.final.sets.filter((_, i) => i !== setIdx) },
                            }));
                            const mdConfirmFinal = () => {
                                const f = bracket.final;
                                const sets = f.sets || [];
                                const t1w = sets.filter(s => (parseInt(s.t1) || 0) > (parseInt(s.t2) || 0)).length;
                                const t2w = sets.filter(s => (parseInt(s.t2) || 0) > (parseInt(s.t1) || 0)).length;
                                const winner = f.winner ?? (t1w > t2w ? f.t1 : t2w > t1w ? f.t2 : f.t1);
                                setBracket(prev => ({ ...prev, phase: 'done', final: { ...f, played: true, winner } }));
                            };

                            const isCreator = !managingTournament || myId === managingTournament.creatorId;

                            return (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => { setTournamentView(null); if (managingTournament?.id) setExpandedTournament(managingTournament.id); }} className="text-gray-400 hover:text-white text-xl transition">←</button>
                                        <div className="flex-1">
                                            <h3 className="text-white font-bold">🎾 Mix Double Surprise Tournament</h3>
                                            <p className="text-gray-500 text-xs">
                                                {bracket
                                                    ? (bracket.phase === 'league' ? `${bracket.matches.filter(m => m.played).length}/${bracket.matches.length} matches played` : bracket.phase === 'final' ? '🏆 Final' : '🏆 Finished')
                                                    : 'Enter 32 players — pairs are drawn randomly'}
                                            </p>
                                        </div>
                                        {bracket && isCreator && (
                                            <button onClick={() => {
                                                if (!confirm('Reset tournament? All scores will be lost.')) return;
                                                if (bracketTournamentId) {
                                                    localStorage.removeItem(`bracket_${bracketTournamentId}`);
                                                    localStorage.removeItem(`bracket_players_${bracketTournamentId}`);
                                                }
                                                setBracket(null);
                                                setBracketTournamentId(null);
                                            }} className="text-red-400/60 hover:text-red-400 text-xs border border-red-500/20 hover:border-red-500/40 px-2 py-1 rounded-xl transition flex-shrink-0">
                                                ↺ Reset
                                            </button>
                                        )}
                                    </div>

                                    {/* Player list */}
                                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                                        <div className="grid grid-cols-[1.5rem_1fr_1fr_3.5rem_4.5rem] gap-0 px-4 py-2 bg-gray-800 text-gray-400 text-[10px] font-bold uppercase tracking-wide">
                                            <span>#</span><span>First Name</span><span>Last Name</span><span className="text-center">Gender</span><span className="text-center">Paid</span>
                                        </div>
                                        <div className={`${bracket ? 'max-h-40' : 'max-h-[60vh]'} overflow-y-auto divide-y divide-gray-800`}>
                                            {mixPlayers.map((p, idx) => (
                                                <div key={p.id} className="grid grid-cols-[1.5rem_1fr_1fr_3.5rem_4.5rem] gap-2 items-center px-4 py-1.5">
                                                    <span className="text-gray-600 text-xs font-mono">{idx + 1}</span>
                                                    <input value={p.firstName}
                                                        onChange={e => setMixPlayers(prev => prev.map((pl, i) => i === idx ? { ...pl, firstName: e.target.value } : pl))}
                                                        placeholder="First name" disabled={!!bracket}
                                                        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 w-full disabled:opacity-50" />
                                                    <input value={p.lastName}
                                                        onChange={e => setMixPlayers(prev => prev.map((pl, i) => i === idx ? { ...pl, lastName: e.target.value } : pl))}
                                                        placeholder="Last name" disabled={!!bracket}
                                                        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 w-full disabled:opacity-50" />
                                                    <div className="flex justify-center">
                                                        <button disabled={!!bracket} onClick={() => setMixPlayers(prev => prev.map((pl, i) => i === idx ? { ...pl, gender: pl.gender === 'M' ? 'F' : pl.gender === 'F' ? 'O' : 'M' } : pl))}
                                                            className={`w-8 h-6 rounded text-[10px] font-black transition border disabled:opacity-50 ${p.gender === 'F' ? 'bg-pink-500/20 border-pink-500/40 text-pink-400' : p.gender === 'O' ? 'bg-purple-500/20 border-purple-500/40 text-purple-400' : 'bg-blue-500/20 border-blue-500/40 text-blue-400'}`}>
                                                            {p.gender}
                                                        </button>
                                                    </div>
                                                    <div className="flex justify-center">
                                                        <button disabled={!!bracket} onClick={() => setMixPlayers(prev => prev.map((pl, i) => i === idx ? { ...pl, paid: !pl.paid } : pl))}
                                                            className={`px-2 py-1 rounded-lg text-[10px] font-black transition border disabled:opacity-50 ${p.paid ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                                                            {p.paid ? '✓' : '✗'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Stats + Start button */}
                                    <div className="space-y-2">
                                        <p className="text-gray-500 text-xs">
                                            {mixPlayers.filter(p => p.gender === 'F').length}F · {mixPlayers.filter(p => p.gender === 'M').length}M · {mixPlayers.filter(p => p.gender === 'O').length}O · {mixPlayers.filter(p => p.paid).length} paid
                                            {mixPlayers.filter(p => (p.firstName + p.lastName).trim()).length < 32 && (
                                                <span className="ml-2 text-yellow-500/80">· {mixPlayers.filter(p => (p.firstName + p.lastName).trim()).length} players filled</span>
                                            )}
                                        </p>
                                        {!bracket && isCreator && (
                                            <button onClick={generateBracket}
                                                className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-3 rounded-2xl text-sm hover:opacity-90 transition`}>
                                                {(() => { const n = mixPlayers.filter(p => (p.firstName + p.lastName).trim()).length; return `🏆 Start Tournament${n < 32 ? ` (${n % 2 === 0 ? n : n - 1} players)` : ''}`; })()}
                                            </button>
                                        )}
                                    </div>

                                    {/* Bracket — shown inline after start */}
                                    {bracket && (
                                        <div className="space-y-4">
                                            {/* Teams */}
                                            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                                                <h4 className="text-white font-bold text-sm mb-3">👫 {bracket.teams.length} Teams</h4>
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    {bracket.teams.map(t => (
                                                        <div key={t.id} className="bg-gray-800 rounded-xl px-3 py-2 text-xs flex items-center gap-1.5">
                                                            <span className="text-gray-600 font-mono w-5">T{t.id + 1}</span>
                                                            <span className={`text-[9px] font-bold ${t.p1.gender === 'F' ? 'text-pink-400' : t.p1.gender === 'O' ? 'text-purple-400' : 'text-blue-400'}`}>{t.p1.gender}</span>
                                                            <span className="text-white truncate">{t.p1.firstName} {t.p1.lastName}</span>
                                                            <span className="text-gray-600">·</span>
                                                            <span className={`text-[9px] font-bold ${t.p2.gender === 'F' ? 'text-pink-400' : t.p2.gender === 'O' ? 'text-purple-400' : 'text-blue-400'}`}>{t.p2.gender}</span>
                                                            <span className="text-white truncate">{t.p2.firstName} {t.p2.lastName}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Matches by round */}
                                            {[1, 2, 3].map(round => (
                                                <div key={round} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
                                                    <h4 className="text-white font-bold text-sm mb-1">Round {round}</h4>
                                                    {bracket.matches.filter(m => m.round === round).map(m => {
                                                        const { t1w, t2w } = mdSetsWon(m);
                                                        const mWinner = m.winner ?? (m.played ? (t1w > t2w ? m.t1 : t2w > t1w ? m.t2 : null) : null);
                                                        return (
                                                            <div key={m.id} className={`rounded-xl px-3 py-2 space-y-1.5 ${m.played ? 'bg-gray-800/60' : 'bg-gray-800'}`}>
                                                                {/* Team name row */}
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className={`text-xs font-semibold truncate flex-1 ${mWinner === m.t1 ? 'text-green-400 font-bold' : 'text-white'}`}>{mdTeamName(m.t1)}</span>
                                                                    {m.played && (
                                                                        <span className="text-gray-400 text-[10px] font-bold flex-shrink-0">
                                                                            {(m.sets || []).map((s, i) => `${s.t1||0}-${s.t2||0}`).join(', ')}
                                                                            <span className="ml-1 text-gray-600">({t1w}-{t2w})</span>
                                                                        </span>
                                                                    )}
                                                                    <span className={`text-xs font-semibold truncate flex-1 text-right ${mWinner === m.t2 ? 'text-green-400 font-bold' : 'text-white'}`}>{mdTeamName(m.t2)}</span>
                                                                </div>
                                                                {/* Score entry (unplayed) */}
                                                                {!m.played && (
                                                                    <div className="space-y-1">
                                                                        {(m.sets || []).map((s, si) => (
                                                                            <div key={si} className="flex items-center gap-1">
                                                                                <span className="text-gray-600 text-[10px] w-8 flex-shrink-0">Set {si + 1}</span>
                                                                                <input value={s.t1} onChange={e => mdUpdateSet(m.id, si, 't1', e.target.value)} className={mdInpCls} placeholder="0" />
                                                                                <span className="text-gray-600 font-bold text-xs">–</span>
                                                                                <input value={s.t2} onChange={e => mdUpdateSet(m.id, si, 't2', e.target.value)} className={mdInpCls} placeholder="0" />
                                                                                {si > 0 && (
                                                                                    <button onClick={() => mdRemoveSet(m.id, si)} className="text-red-400/60 hover:text-red-400 text-xs px-1 transition">✕</button>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                        <div className="flex items-center gap-2 pt-0.5">
                                                                            <button onClick={() => mdAddSet(m.id)} className="text-purple-400/70 hover:text-purple-400 text-[10px] font-bold transition">+ Set</button>
                                                                            {(() => { const { t1w: cw, t2w: cl } = mdSetsWon(m); return cw === cl && cw > 0 ? (
                                                                                <span className="text-gray-500 text-[10px]">Tie — pick winner:
                                                                                    <button onClick={() => mdSetWinner(m.id, m.t1)} className={`ml-1 text-[10px] font-bold ${m.winner === m.t1 ? 'text-green-400' : 'text-gray-400 hover:text-white'} transition`}>{mdTeamName(m.t1)}</button>
                                                                                    <span className="text-gray-600"> / </span>
                                                                                    <button onClick={() => mdSetWinner(m.id, m.t2)} className={`text-[10px] font-bold ${m.winner === m.t2 ? 'text-green-400' : 'text-gray-400 hover:text-white'} transition`}>{mdTeamName(m.t2)}</button>
                                                                                </span>
                                                                            ) : null; })()}
                                                                            <button onClick={() => mdMarkPlayed(m.id)} className="ml-auto bg-green-600/80 hover:bg-green-600 text-white text-[10px] font-black px-2 py-1 rounded-lg transition">✓ Confirm</button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}

                                            {/* Overall Standings */}
                                            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                                                <h4 className="text-white font-bold text-sm mb-3">📊 Overall Standings</h4>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="border-b border-gray-800 text-[10px] uppercase tracking-wide text-gray-500">
                                                                <th className="text-left py-1 w-5">#</th>
                                                                <th className="text-left py-1 pr-2">Team</th>
                                                                <th className="text-center w-6">P</th>
                                                                <th className="text-center w-6">W</th>
                                                                <th className="text-center w-6">L</th>
                                                                <th className="text-center w-8">GW</th>
                                                                <th className="text-center w-8">GL</th>
                                                                <th className="text-center w-8">GD</th>
                                                                <th className="text-center w-10">Avg</th>
                                                                <th className="text-center w-8 text-yellow-400">Pts</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {mdStandings.map((s, i) => (
                                                                <tr key={s.tid} className={`border-b border-gray-800/40 ${i === 0 ? 'text-yellow-400 font-bold' : i === 1 ? 'text-green-400 font-bold' : 'text-gray-400'}`}>
                                                                    <td className="py-1.5 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                                                                    <td className="py-1.5 pr-2 truncate max-w-[8rem]">{mdTeamFull(s.tid)}</td>
                                                                    <td className="text-center">{s.played}</td>
                                                                    <td className="text-center">{s.won}</td>
                                                                    <td className="text-center">{s.lost}</td>
                                                                    <td className="text-center">{s.gw}</td>
                                                                    <td className="text-center">{s.gl}</td>
                                                                    <td className="text-center">{s.gw - s.gl > 0 ? `+${s.gw - s.gl}` : s.gw - s.gl}</td>
                                                                    <td className="text-center">{s.avg}</td>
                                                                    <td className="text-center font-bold text-yellow-400">{s.pts}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>

                                            {/* Start Final */}
                                            {bracket.phase === 'league' && mdAllDone && (
                                                <button onClick={mdStartFinal}
                                                    className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-3 rounded-2xl text-sm hover:opacity-90 transition`}>
                                                    🏆 Start Final — {mdTeamName(mdStandings[0]?.tid)} vs {mdTeamName(mdStandings[1]?.tid)}
                                                </button>
                                            )}

                                            {/* Final match */}
                                            {(bracket.phase === 'final' || bracket.phase === 'done') && bracket.final && (
                                                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 space-y-3">
                                                    <h4 className="text-yellow-400 font-bold text-sm">🏆 Final</h4>
                                                    <div className={`rounded-xl px-3 py-2 space-y-1.5 ${bracket.final.played ? 'bg-gray-800/60' : 'bg-gray-800'}`}>
                                                        {/* Team names + played summary */}
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className={`text-xs font-bold truncate flex-1 ${bracket.final.winner === bracket.final.t1 ? 'text-yellow-400' : 'text-white'}`}>{mdTeamFull(bracket.final.t1)}</span>
                                                            {bracket.final.played && (
                                                                <span className="text-gray-400 text-[10px] font-bold flex-shrink-0">
                                                                    {(bracket.final.sets || []).map(s => `${s.t1||0}-${s.t2||0}`).join(', ')}
                                                                    {(() => { const sets = bracket.final.sets||[]; const t1w=sets.filter(s=>(parseInt(s.t1)||0)>(parseInt(s.t2)||0)).length; const t2w=sets.filter(s=>(parseInt(s.t2)||0)>(parseInt(s.t1)||0)).length; return <span className="ml-1 text-gray-600">({t1w}-{t2w})</span>; })()}
                                                                </span>
                                                            )}
                                                            <span className={`text-xs font-bold truncate flex-1 text-right ${bracket.final.winner === bracket.final.t2 ? 'text-yellow-400' : 'text-white'}`}>{mdTeamFull(bracket.final.t2)}</span>
                                                        </div>
                                                        {/* Score entry */}
                                                        {!bracket.final.played && (
                                                            <div className="space-y-1">
                                                                {(bracket.final.sets || []).map((s, si) => (
                                                                    <div key={si} className="flex items-center gap-1">
                                                                        <span className="text-gray-600 text-[10px] w-8 flex-shrink-0">Set {si + 1}</span>
                                                                        <input value={s.t1} onChange={e => mdUpdateFinalSet(si, 't1', e.target.value)} className={mdInpCls} placeholder="0" />
                                                                        <span className="text-gray-600 font-bold text-xs">–</span>
                                                                        <input value={s.t2} onChange={e => mdUpdateFinalSet(si, 't2', e.target.value)} className={mdInpCls} placeholder="0" />
                                                                        {si > 0 && (
                                                                            <button onClick={() => mdRemoveFinalSet(si)} className="text-red-400/60 hover:text-red-400 text-xs px-1 transition">✕</button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                <div className="flex items-center gap-2 pt-0.5">
                                                                    <button onClick={mdAddFinalSet} className="text-purple-400/70 hover:text-purple-400 text-[10px] font-bold transition">+ Set</button>
                                                                    {(() => { const sets = bracket.final.sets||[]; const t1w=sets.filter(s=>(parseInt(s.t1)||0)>(parseInt(s.t2)||0)).length; const t2w=sets.filter(s=>(parseInt(s.t2)||0)>(parseInt(s.t1)||0)).length; return t1w===t2w && t1w>0 ? (
                                                                        <span className="text-gray-500 text-[10px]">Tie — pick winner:
                                                                            <button onClick={() => setBracket(prev => ({ ...prev, final: { ...prev.final, winner: prev.final.t1 } }))} className={`ml-1 text-[10px] font-bold ${bracket.final.winner === bracket.final.t1 ? 'text-yellow-400' : 'text-gray-400 hover:text-white'} transition`}>{mdTeamName(bracket.final.t1)}</button>
                                                                            <span className="text-gray-600"> / </span>
                                                                            <button onClick={() => setBracket(prev => ({ ...prev, final: { ...prev.final, winner: prev.final.t2 } }))} className={`text-[10px] font-bold ${bracket.final.winner === bracket.final.t2 ? 'text-yellow-400' : 'text-gray-400 hover:text-white'} transition`}>{mdTeamName(bracket.final.t2)}</button>
                                                                        </span>
                                                                    ) : null; })()}
                                                                    <button onClick={mdConfirmFinal} className="ml-auto bg-yellow-500/80 hover:bg-yellow-500 text-black text-[10px] font-black px-2 py-1 rounded-lg transition">✓ Confirm Final</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {bracket.phase === 'done' && bracket.final.winner != null && (
                                                        <div className="text-center pt-2 space-y-3">
                                                            <p className="text-4xl mb-1">🏆</p>
                                                            <p className="text-yellow-400 font-black text-base">CHAMPION</p>
                                                            <p className="text-white font-bold text-sm mt-0.5">{mdTeamFull(bracket.final.winner)}</p>
                                                            {isCreator && managingTournament?.id && (
                                                                <button onClick={async () => {
                                                                    if (!confirm('Archive this tournament? The bracket will be saved permanently and removed from active view.')) return;
                                                                    try {
                                                                        await api.post(`/tournaments/${managingTournament.id}/complete`, { bracketData: bracket });
                                                                        localStorage.removeItem(`bracket_${managingTournament.id}`);
                                                                        localStorage.removeItem(`bracket_players_${managingTournament.id}`);
                                                                        setBracket(null);
                                                                        setBracketTournamentId(null);
                                                                        setManagingTournament(null);
                                                                        setTournamentView(null);
                                                                        setTournaments(prev => prev.filter(t => t.id !== managingTournament.id));
                                                                        alert('Tournament archived! View it in the Archive page.');
                                                                    } catch (e) { alert(e?.response?.data?.message || 'Error archiving tournament'); }
                                                                }} className="mx-auto block bg-green-600/80 hover:bg-green-600 text-white font-bold px-6 py-2 rounded-xl text-sm transition">
                                                                    📦 Archive Tournament
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        if (tournamentView === 'singles' || tournamentView === 'team') return (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setTournamentView(null)} className="text-gray-400 hover:text-white text-xl transition">←</button>
                                    <h3 className="text-white font-bold">
                                        {tournamentView === 'singles' ? '🏆 Singles Elimination' : '👥 Team Tournament (4v4)'}
                                    </h3>
                                </div>
                                <div className="text-center py-16 bg-gray-900 rounded-2xl border border-gray-800">
                                    <p className="text-4xl mb-3">🚧</p>
                                    <p className="text-white font-bold">Coming Soon</p>
                                    <p className="text-gray-500 text-sm mt-1">This tournament type is under development.</p>
                                </div>
                            </div>
                        );

                        if (false && tournamentView === 'bracket' && bracket) {
                            const teamById  = (id) => bracket.teams.find(t => t.id === id);
                            const teamName  = (id) => { const t = teamById(id); return t ? `${t.p1.firstName}/${t.p2.firstName}` : '?'; };
                            const teamFull  = (id) => { const t = teamById(id); return t ? `${t.p1.firstName} ${t.p1.lastName} & ${t.p2.firstName} ${t.p2.lastName}` : '?'; };
                            const inpCls    = "w-10 bg-gray-800 border border-gray-700 rounded text-white text-center text-sm py-1 focus:outline-none focus:border-purple-500";

                            // Overall standings across all matches
                            const computeStandings = () => {
                                const stats = {};
                                bracket.teams.forEach(t => { stats[t.id] = { played: 0, won: 0, lost: 0, gw: 0, gl: 0, pts: 0 }; });
                                bracket.matches.forEach(m => {
                                    if (!m.played) return;
                                    const s1 = parseInt(m.s1) || 0, s2 = parseInt(m.s2) || 0;
                                    stats[m.t1].played++; stats[m.t2].played++;
                                    stats[m.t1].gw += s1; stats[m.t1].gl += s2;
                                    stats[m.t2].gw += s2; stats[m.t2].gl += s1;
                                    if (s1 > s2)      { stats[m.t1].won++; stats[m.t1].pts += 3; stats[m.t2].lost++; }
                                    else if (s2 > s1) { stats[m.t2].won++; stats[m.t2].pts += 3; stats[m.t1].lost++; }
                                    else              { stats[m.t1].pts++; stats[m.t2].pts++; }
                                });
                                return bracket.teams
                                    .map(t => ({ tid: t.id, ...stats[t.id], avg: stats[t.id].played ? (stats[t.id].gw / stats[t.id].played).toFixed(2) : '-' }))
                                    .sort((a, b) => b.pts - a.pts || (b.gw - b.gl) - (a.gw - a.gl) || b.gw - a.gw);
                            };

                            const updateScore = (matchId, field, val) => {
                                setBracket(prev => ({
                                    ...prev,
                                    matches: prev.matches.map(m => m.id !== matchId ? m : { ...m, [field]: val }),
                                }));
                            };
                            const markPlayed = (matchId) => {
                                setBracket(prev => ({
                                    ...prev,
                                    matches: prev.matches.map(m => m.id !== matchId ? m : { ...m, played: true }),
                                }));
                            };

                            const allMatchesDone = bracket.matches.every(m => m.played);

                            const startFinal = () => {
                                const top2 = computeStandings().slice(0, 2);
                                setBracket(prev => ({
                                    ...prev,
                                    phase: 'final',
                                    final: { t1: top2[0].tid, t2: top2[1].tid, s1: '', s2: '', played: false },
                                }));
                            };
                            const confirmFinal = () => {
                                const f = bracket.final;
                                const s1 = parseInt(f.s1) || 0, s2 = parseInt(f.s2) || 0;
                                setBracket(prev => ({
                                    ...prev,
                                    phase: 'done',
                                    final: { ...f, played: true, winner: s1 >= s2 ? f.t1 : f.t2 },
                                }));
                            };

                            const standings = computeStandings();
                            const rounds = [1, 2, 3];

                            return (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setTournamentView('mix_double')} className="text-gray-400 hover:text-white text-xl transition">←</button>
                                        <div className="flex-1">
                                            <h3 className="text-white font-bold">🎾 Mix Double Surprise Tournament</h3>
                                            <p className="text-gray-500 text-xs">
                                                {bracket.phase === 'league' ? `${bracket.matches.filter(m => m.played).length}/${bracket.matches.length} matches played` : bracket.phase === 'final' ? '🏆 Final' : '🏆 Finished'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* TEAMS */}
                                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                                        <h4 className="text-white font-bold text-sm mb-3">👫 16 Teams</h4>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {bracket.teams.map(t => (
                                                <div key={t.id} className="bg-gray-800 rounded-xl px-3 py-2 text-xs flex items-center gap-1.5">
                                                    <span className="text-gray-600 font-mono w-5">T{t.id + 1}</span>
                                                    <span className={`text-[9px] font-bold ${t.p1.gender === 'F' ? 'text-pink-400' : t.p1.gender === 'O' ? 'text-purple-400' : 'text-blue-400'}`}>{t.p1.gender}</span>
                                                    <span className="text-white truncate">{t.p1.firstName} {t.p1.lastName}</span>
                                                    <span className="text-gray-600">·</span>
                                                    <span className={`text-[9px] font-bold ${t.p2.gender === 'F' ? 'text-pink-400' : t.p2.gender === 'O' ? 'text-purple-400' : 'text-blue-400'}`}>{t.p2.gender}</span>
                                                    <span className="text-white truncate">{t.p2.firstName} {t.p2.lastName}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* MATCHES by round */}
                                    {rounds.map(round => (
                                        <div key={round} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
                                            <h4 className="text-white font-bold text-sm mb-1">Round {round}</h4>
                                            {bracket.matches.filter(m => m.round === round).map(m => (
                                                <div key={m.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${m.played ? 'bg-gray-800/60' : 'bg-gray-800'}`}>
                                                    <span className="text-white text-xs font-semibold flex-1 truncate">{teamName(m.t1)}</span>
                                                    {m.played ? (
                                                        <span className="text-white font-black text-sm px-2 flex-shrink-0">{m.s1} – {m.s2}</span>
                                                    ) : (
                                                        <div className="flex items-center gap-1 flex-shrink-0">
                                                            <input value={m.s1} onChange={e => updateScore(m.id, 's1', e.target.value)} className={inpCls} placeholder="0" />
                                                            <span className="text-gray-600 font-bold">–</span>
                                                            <input value={m.s2} onChange={e => updateScore(m.id, 's2', e.target.value)} className={inpCls} placeholder="0" />
                                                            <button onClick={() => markPlayed(m.id)}
                                                                className="ml-1 bg-green-600/80 hover:bg-green-600 text-white text-[10px] font-black px-2 py-1 rounded-lg transition">✓</button>
                                                        </div>
                                                    )}
                                                    <span className="text-white text-xs font-semibold flex-1 truncate text-right">{teamName(m.t2)}</span>
                                                    {m.played && (
                                                        <span className="text-green-400 text-[9px] font-bold w-12 text-right flex-shrink-0">
                                                            {parseInt(m.s1) > parseInt(m.s2) ? `✓ ${teamName(m.t1)}` : parseInt(m.s2) > parseInt(m.s1) ? `✓ ${teamName(m.t2)}` : 'Draw'}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ))}

                                    {/* OVERALL STANDINGS */}
                                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                                        <h4 className="text-white font-bold text-sm mb-3">📊 Overall Standings</h4>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="border-b border-gray-800 text-[10px] uppercase tracking-wide text-gray-500">
                                                        <th className="text-left py-1 w-5">#</th>
                                                        <th className="text-left py-1 pr-2">Team</th>
                                                        <th className="text-center w-6">P</th>
                                                        <th className="text-center w-6">W</th>
                                                        <th className="text-center w-6">L</th>
                                                        <th className="text-center w-8">GW</th>
                                                        <th className="text-center w-8">GL</th>
                                                        <th className="text-center w-8">GD</th>
                                                        <th className="text-center w-10">Avg</th>
                                                        <th className="text-center w-8 text-yellow-400">Pts</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {standings.map((s, i) => (
                                                        <tr key={s.tid} className={`border-b border-gray-800/40 ${i === 0 ? 'text-yellow-400 font-bold' : i === 1 ? 'text-green-400 font-bold' : 'text-gray-400'}`}>
                                                            <td className="py-1.5 text-center">
                                                                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                                                            </td>
                                                            <td className="py-1.5 pr-2 truncate max-w-[8rem]">{teamFull(s.tid)}</td>
                                                            <td className="text-center">{s.played}</td>
                                                            <td className="text-center">{s.won}</td>
                                                            <td className="text-center">{s.lost}</td>
                                                            <td className="text-center">{s.gw}</td>
                                                            <td className="text-center">{s.gl}</td>
                                                            <td className="text-center">{s.gw - s.gl > 0 ? `+${s.gw - s.gl}` : s.gw - s.gl}</td>
                                                            <td className="text-center">{s.avg}</td>
                                                            <td className="text-center font-bold text-yellow-400">{s.pts}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Final */}
                                    {bracket.phase === 'league' && allMatchesDone && (
                                        <button onClick={startFinal}
                                            className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-3 rounded-2xl text-sm hover:opacity-90 transition`}>
                                            🏆 Start Final — {teamName(standings[0]?.tid)} vs {teamName(standings[1]?.tid)}
                                        </button>
                                    )}

                                    {(bracket.phase === 'final' || bracket.phase === 'done') && bracket.final && (
                                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 space-y-3">
                                            <h4 className="text-yellow-400 font-bold text-sm">🏆 Final</h4>
                                            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${bracket.final.played ? 'bg-gray-800/60' : 'bg-gray-800'}`}>
                                                <span className={`text-xs font-bold flex-1 truncate ${bracket.final.played && bracket.final.winner === bracket.final.t1 ? 'text-yellow-400' : 'text-white'}`}>{teamFull(bracket.final.t1)}</span>
                                                {bracket.final.played ? (
                                                    <span className="text-white font-black text-sm px-2">{bracket.final.s1} – {bracket.final.s2}</span>
                                                ) : (
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        <input value={bracket.final.s1} onChange={e => setBracket(prev => ({ ...prev, final: { ...prev.final, s1: e.target.value } }))} className={inpCls} placeholder="0" />
                                                        <span className="text-gray-600 font-bold">–</span>
                                                        <input value={bracket.final.s2} onChange={e => setBracket(prev => ({ ...prev, final: { ...prev.final, s2: e.target.value } }))} className={inpCls} placeholder="0" />
                                                        <button onClick={confirmFinal} className="ml-1 bg-yellow-500/80 hover:bg-yellow-500 text-black text-[10px] font-black px-2 py-1 rounded-lg transition">✓</button>
                                                    </div>
                                                )}
                                                <span className={`text-xs font-bold flex-1 truncate text-right ${bracket.final.played && bracket.final.winner === bracket.final.t2 ? 'text-yellow-400' : 'text-white'}`}>{teamFull(bracket.final.t2)}</span>
                                            </div>
                                            {bracket.phase === 'done' && bracket.final.winner != null && (
                                                <div className="text-center pt-2">
                                                    <p className="text-4xl mb-1">🏆</p>
                                                    <p className="text-yellow-400 font-black text-base">CHAMPION</p>
                                                    <p className="text-white font-bold text-sm mt-0.5">{teamFull(bracket.final.winner)}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return null;
                    })()}

                    {/* COACHES TAB */}
                    {activeTab === 'coaches' && (() => {
                        const CRED_LEVELS = [
                            { id: 'CERTIFIED',   label: 'Certified Coach',     emoji: '🏅', color: 'text-yellow-400' },
                            { id: 'LICENSED',    label: 'Licensed Coach',      emoji: '📜', color: 'text-blue-400'   },
                            { id: 'CLUB_COACH',  label: 'Club / Academy Coach', emoji: '🏫', color: 'text-green-400' },
                            { id: 'INDEPENDENT', label: 'Independent Coach',   emoji: '🎯', color: 'text-purple-400' },
                            { id: 'AMATEUR',     label: 'Amateur / Hobbyist',  emoji: '⭐', color: 'text-gray-400'   },
                        ];
                        const DAYS = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
                        const DAY_LABEL = { MON:'Mon', TUE:'Tue', WED:'Wed', THU:'Thu', FRI:'Fri', SAT:'Sat', SUN:'Sun' };

                        const credOf = (id) => CRED_LEVELS.find(c => c.id === id) || CRED_LEVELS[4];

                        function CoachForm({ onClose, onCreated, defaultGroup }) {
                            const [f, setF] = useState({
                                credentialLevel: 'CERTIFIED', certName: '', experience: '',
                                individual: !defaultGroup, group: !!defaultGroup,
                                priceIndividual: '', priceGroup: '', maxGroupSize: 4,
                                location: '', city: '', days: [], timeFrom: '09:00', timeTo: '21:00',
                                description: '', cvUrl: '',
                            });
                            const [submitting, setSubmitting] = useState(false);
                            const [uploadingCv, setUploadingCv] = useState(false);
                            const set = (k, v) => setF(p => ({ ...p, [k]: v }));
                            const toggleDay = (d) => setF(p => ({
                                ...p, days: p.days.includes(d) ? p.days.filter(x => x !== d) : [...p.days, d],
                            }));

                            const handleCvUpload = async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setUploadingCv(true);
                                try {
                                    const formData = new FormData();
                                    formData.append('file', file);
                                    const { data } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                                    set('cvUrl', data.url);
                                } catch (err) { console.error(err); }
                                finally { setUploadingCv(false); }
                            };

                            const submit = async () => {
                                if (!f.location || (!f.individual && !f.group))
                                    return alert('Please fill location and select at least one lesson type.');
                                setSubmitting(true);
                                try {
                                    const { data } = await api.post('/coaches', {
                                        ...f,
                                        category: categoryUpper,
                                        subCategory: sub,
                                        experience: Number(f.experience) || 0,
                                        priceIndividual: Number(f.priceIndividual) || 0,
                                        priceGroup: Number(f.priceGroup) || 0,
                                    });
                                    onCreated(data);
                                    onClose();
                                } catch (err) { console.error(err); }
                                finally { setSubmitting(false); }
                            };

                            return (
                                <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-white font-bold">🎓 Post Coach Listing</p>
                                        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
                                    </div>

                                    {/* Credential level */}
                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-2">Credential Level</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {CRED_LEVELS.map(c => (
                                                <button key={c.id} onClick={() => set('credentialLevel', c.id)}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition
                                                        ${f.credentialLevel === c.id ? 'border-purple-500 bg-purple-600/20 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'}`}>
                                                    <span>{c.emoji}</span> {c.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Cert name + experience */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-gray-400 text-xs font-bold mb-1">Certification Name <span className="text-gray-600">(optional)</span></p>
                                            <input value={f.certName} onChange={e => set('certName', e.target.value)}
                                                placeholder="e.g. ITF Level 2"
                                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-xs font-bold mb-1">Years of Experience</p>
                                            <input type="number" min="0" max="50" value={f.experience} onChange={e => set('experience', e.target.value)}
                                                placeholder="0"
                                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                        </div>
                                    </div>

                                    {/* Lesson types */}
                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-2">Lesson Types</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className={`border rounded-xl p-3 transition cursor-pointer ${f.individual ? 'border-purple-500 bg-purple-600/10' : 'border-gray-700 bg-gray-800'}`}
                                                onClick={() => set('individual', !f.individual)}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-white text-xs font-bold">👤 Individual</span>
                                                    <div className={`w-4 h-4 rounded-full border-2 ${f.individual ? 'bg-purple-500 border-purple-500' : 'border-gray-600'}`} />
                                                </div>
                                                {f.individual && (
                                                    <input type="number" min="0" value={f.priceIndividual}
                                                        onChange={e => { e.stopPropagation(); set('priceIndividual', e.target.value); }}
                                                        onClick={e => e.stopPropagation()}
                                                        placeholder="Price / hour (₺)"
                                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500" />
                                                )}
                                            </div>
                                            <div className={`border rounded-xl p-3 transition cursor-pointer ${f.group ? 'border-purple-500 bg-purple-600/10' : 'border-gray-700 bg-gray-800'}`}
                                                onClick={() => set('group', !f.group)}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-white text-xs font-bold">👥 Group</span>
                                                    <div className={`w-4 h-4 rounded-full border-2 ${f.group ? 'bg-purple-500 border-purple-500' : 'border-gray-600'}`} />
                                                </div>
                                                {f.group && (
                                                    <div className="space-y-1.5" onClick={e => e.stopPropagation()}>
                                                        <input type="number" min="0" value={f.priceGroup}
                                                            onChange={e => set('priceGroup', e.target.value)}
                                                            placeholder="Price / person (₺)"
                                                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500" />
                                                        <select value={f.maxGroupSize} onChange={e => set('maxGroupSize', Number(e.target.value))}
                                                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500">
                                                            {[2,3,4,5,6,8,10].map(n => <option key={n} value={n}>Max {n} students</option>)}
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Location */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-gray-400 text-xs font-bold mb-1">Location / Venue *</p>
                                            <input value={f.location} onChange={e => set('location', e.target.value)}
                                                placeholder="Club name, court, address..."
                                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-xs font-bold mb-1">City</p>
                                            <input value={f.city} onChange={e => set('city', e.target.value)}
                                                placeholder="Istanbul, Ankara..."
                                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                        </div>
                                    </div>

                                    {/* Days */}
                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-2">Available Days</p>
                                        <div className="flex gap-1.5 flex-wrap">
                                            {DAYS.map(d => (
                                                <button key={d} onClick={() => toggleDay(d)}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition
                                                        ${f.days.includes(d) ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                                                    {DAY_LABEL[d]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Time range */}
                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-2">Available Hours</p>
                                        <div className="flex items-center gap-2">
                                            <input type="time" value={f.timeFrom} onChange={e => set('timeFrom', e.target.value)}
                                                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                            <span className="text-gray-500">—</span>
                                            <input type="time" value={f.timeTo} onChange={e => set('timeTo', e.target.value)}
                                                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-1">About / Description <span className="text-gray-600">(optional)</span></p>
                                        <textarea value={f.description} onChange={e => set('description', e.target.value)}
                                            rows={3} placeholder="Introduce yourself, your coaching style, specialties..."
                                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
                                    </div>

                                    {/* CV */}
                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-1">{t('coaches.cv_upload')} <span className="text-gray-600">({t('coaches.about_optional')})</span></p>
                                        <input type="file" accept="image/*" onChange={handleCvUpload}
                                            className="w-full text-gray-400 text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-700 file:text-white file:text-xs file:font-bold" />
                                        {uploadingCv && <p className="text-gray-500 text-xs mt-1">{t('common.loading')}</p>}
                                        {f.cvUrl && !uploadingCv && <p className="text-green-400 text-xs mt-1">✓ {t('coaches.cv_uploaded')}</p>}
                                    </div>

                                    <button onClick={submit} disabled={submitting}
                                        className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50`}>
                                        {submitting ? 'Posting...' : '🎓 Post Listing'}
                                    </button>
                                </div>
                            );
                        }

                        function RefereeForm({ onClose, onCreated }) {
                            const [f, setF] = useState({
                                credentialLevel: 'INDEPENDENT', certName: '', experience: '',
                                achievements: '', pricePerMatch: '',
                                location: '', city: '', days: [], timeFrom: '09:00', timeTo: '21:00',
                                description: '', cvUrl: '',
                            });
                            const [submitting, setSubmitting] = useState(false);
                            const [uploadingCv, setUploadingCv] = useState(false);
                            const set = (k, v) => setF(p => ({ ...p, [k]: v }));
                            const toggleDay = (d) => setF(p => ({
                                ...p, days: p.days.includes(d) ? p.days.filter(x => x !== d) : [...p.days, d],
                            }));

                            const handleCvUpload = async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setUploadingCv(true);
                                try {
                                    const formData = new FormData();
                                    formData.append('file', file);
                                    const { data } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                                    set('cvUrl', data.url);
                                } catch (err) { console.error(err); }
                                finally { setUploadingCv(false); }
                            };

                            const submit = async () => {
                                if (!f.location) return alert('Please fill location.');
                                setSubmitting(true);
                                try {
                                    const { data } = await api.post('/referees', {
                                        ...f,
                                        category: categoryUpper,
                                        subCategory: sub,
                                        experience: Number(f.experience) || 0,
                                        pricePerMatch: Number(f.pricePerMatch) || 0,
                                    });
                                    onCreated(data);
                                    onClose();
                                } catch (err) { console.error(err); }
                                finally { setSubmitting(false); }
                            };

                            return (
                                <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-white font-bold">🟨 {t('referees.post_listing')}</p>
                                        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
                                    </div>

                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-2">{t('coaches.credential')}</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {CRED_LEVELS.map(c => (
                                                <button key={c.id} onClick={() => set('credentialLevel', c.id)}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition
                                                        ${f.credentialLevel === c.id ? 'border-purple-500 bg-purple-600/20 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'}`}>
                                                    <span>{c.emoji}</span> {c.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-gray-400 text-xs font-bold mb-1">{t('coaches.cert_name')}</p>
                                            <input value={f.certName} onChange={e => set('certName', e.target.value)}
                                                placeholder="e.g. TFF C License"
                                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-xs font-bold mb-1">{t('coaches.experience')}</p>
                                            <input type="number" min="0" max="50" value={f.experience} onChange={e => set('experience', e.target.value)}
                                                placeholder="0"
                                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-1">{t('referees.price_per_match')}</p>
                                        <input type="number" min="0" value={f.pricePerMatch} onChange={e => set('pricePerMatch', e.target.value)}
                                            placeholder="₺"
                                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-gray-400 text-xs font-bold mb-1">{t('coaches.location_venue')} *</p>
                                            <input value={f.location} onChange={e => set('location', e.target.value)}
                                                placeholder="Club name, court, address..."
                                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-xs font-bold mb-1">{t('coaches.city')}</p>
                                            <input value={f.city} onChange={e => set('city', e.target.value)}
                                                placeholder="Istanbul, Ankara..."
                                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-2">{t('coaches.available_days')}</p>
                                        <div className="flex gap-1.5 flex-wrap">
                                            {DAYS.map(d => (
                                                <button key={d} onClick={() => toggleDay(d)}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition
                                                        ${f.days.includes(d) ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                                                    {DAY_LABEL[d]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-2">{t('coaches.available_hours')}</p>
                                        <div className="flex items-center gap-2">
                                            <input type="time" value={f.timeFrom} onChange={e => set('timeFrom', e.target.value)}
                                                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                            <span className="text-gray-500">—</span>
                                            <input type="time" value={f.timeTo} onChange={e => set('timeTo', e.target.value)}
                                                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-1">{t('referees.achievements')} <span className="text-gray-600">({t('coaches.about_optional')})</span></p>
                                        <input value={f.achievements} onChange={e => set('achievements', e.target.value)}
                                            placeholder="e.g. 50+ league matches officiated"
                                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                    </div>

                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-1">{t('coaches.about')} <span className="text-gray-600">({t('coaches.about_optional')})</span></p>
                                        <textarea value={f.description} onChange={e => set('description', e.target.value)}
                                            rows={3} placeholder="Introduce yourself, your officiating style, specialties..."
                                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
                                    </div>

                                    <div>
                                        <p className="text-gray-400 text-xs font-bold mb-1">{t('coaches.cv_upload')} <span className="text-gray-600">({t('coaches.about_optional')})</span></p>
                                        <input type="file" accept="image/*" onChange={handleCvUpload}
                                            className="w-full text-gray-400 text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-700 file:text-white file:text-xs file:font-bold" />
                                        {uploadingCv && <p className="text-gray-500 text-xs mt-1">{t('common.loading')}</p>}
                                        {f.cvUrl && !uploadingCv && <p className="text-green-400 text-xs mt-1">✓ {t('coaches.cv_uploaded')}</p>}
                                    </div>

                                    <button onClick={submit} disabled={submitting}
                                        className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50`}>
                                        {submitting ? 'Posting...' : `🟨 ${t('referees.post_listing')}`}
                                    </button>
                                </div>
                            );
                        }

                        const isCoachExpanded = COACH_EXPANDED_SPORTS.has(sub);
                        const individualCoaches = coachListings.filter(c => c.individual);
                        const groupCourses = coachListings.filter(c => c.group);
                        const coachesWithCv = coachListings.filter(c => c.cvUrl);
                        const refereeMatches = playerWantedPosts.filter(p =>
                            Array.isArray(p.positions) && (p.positions.includes('REFEREE') || p.positions.includes('REFEREE_OFFER'))
                        );
                        const subTabs = isCoachExpanded
                            ? [
                                { key: 'listings', label: t('coaches.sub_listings'), count: individualCoaches.length },
                                { key: 'courses',  label: t('coaches.sub_courses'),  count: groupCourses.length },
                                { key: 'referees', label: t('coaches.sub_referees'), count: refereeListings.length + refereeMatches.length },
                                { key: 'cvs',      label: t('coaches.sub_cvs'),      count: coachesWithCv.length },
                            ]
                            : [
                                { key: 'listings', label: t('coaches.title'),   count: coachListings.length },
                                { key: 'cvs',      label: t('coaches.sub_cvs'), count: coachesWithCv.length },
                            ];
                        const shownCoaches = coachSubTab === 'cvs' ? coachesWithCv
                            : coachSubTab === 'courses' ? groupCourses
                            : (isCoachExpanded && coachSubTab === 'listings') ? individualCoaches
                            : coachListings;

                        return (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-white font-bold">🎓 {isCoachExpanded ? t('coaches.support_title') : t('coaches.title')}</h3>
                                        <CityAlertBtn tab={coachSubTab === 'referees' ? 'referees' : 'coaches'}
                                            desc={coachSubTab === 'referees' ? 'Şehrinde yeni hakem ilanı açılınca bildirim al' : 'Şehrinde yeni antrenör ilanı açılınca bildirim al'} />
                                    </div>
                                    {coachSubTab === 'referees' ? (
                                        <button onClick={() => setShowCreateReferee(v => !v)}
                                            className={`bg-gradient-to-r ${config.color} text-white font-bold px-4 py-2 rounded-xl text-sm hover:opacity-90 transition`}>
                                            {showCreateReferee ? `✕ ${t('coaches.cancel')}` : `+ ${t('referees.post_listing')}`}
                                        </button>
                                    ) : (
                                        <button onClick={() => setCoachForm(v => !v)}
                                            className={`bg-gradient-to-r ${config.color} text-white font-bold px-4 py-2 rounded-xl text-sm hover:opacity-90 transition`}>
                                            {coachForm ? `✕ ${t('coaches.cancel')}` : `+ ${coachSubTab === 'courses' ? t('coaches.post_course') : t('coaches.post_listing')}`}
                                        </button>
                                    )}
                                </div>

                                {/* Sub-tab bar (tennis/padel/volleyball get the 4-way split) */}
                                <div className="flex gap-1.5 flex-wrap bg-gray-900 p-1 rounded-xl border border-gray-800">
                                    {subTabs.map(st => (
                                        <button key={st.key} onClick={() => setCoachSubTab(st.key)}
                                            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${coachSubTab === st.key ? `bg-gradient-to-r ${config.color} text-white` : 'text-gray-400 hover:text-white'}`}>
                                            {st.label} ({st.count})
                                        </button>
                                    ))}
                                </div>

                                {coachForm && coachSubTab !== 'referees' && (
                                    <CoachForm
                                        onClose={() => setCoachForm(false)}
                                        onCreated={(listing) => setCoachListings(prev => [listing, ...prev])}
                                        defaultGroup={coachSubTab === 'courses'}
                                    />
                                )}

                                {showCreateReferee && coachSubTab === 'referees' && (
                                    <RefereeForm
                                        onClose={() => setShowCreateReferee(false)}
                                        onCreated={(listing) => setRefereeListings(prev => [listing, ...prev])}
                                    />
                                )}

                                {coachSubTab === 'referees' ? (
                                    <div className="space-y-5">
                                        <div>
                                            <p className="text-white text-sm font-bold mb-2">{t('referees.listings_title')}</p>
                                            {loadingReferees ? (
                                                <p className="text-gray-500 text-sm text-center py-6">{t('common.loading')}</p>
                                            ) : refereeListings.length === 0 ? (
                                                <p className="text-gray-600 text-sm text-center py-6">{t('referees.no_listings')}</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {refereeListings.map(r => {
                                                        const cred = credOf(r.credentialLevel);
                                                        return (
                                                            <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                                                                <div className="flex items-start justify-between mb-2">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-9 h-9 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                                                                            {r.user?.username?.[0]?.toUpperCase() || '?'}
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-white font-bold text-sm">{r.user?.fullName || r.user?.username}</p>
                                                                            <p className="text-gray-500 text-xs">@{r.user?.username}</p>
                                                                        </div>
                                                                    </div>
                                                                    <span className={`text-xs font-bold ${cred.color}`}>{cred.emoji} {cred.label}</span>
                                                                </div>
                                                                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-gray-400">
                                                                    <span>📍 {r.location}{r.city ? `, ${r.city}` : ''}</span>
                                                                    <span>🕐 {r.timeFrom} — {r.timeTo}</span>
                                                                    {r.pricePerMatch > 0 && <span className="text-purple-400 font-bold">₺{r.pricePerMatch}/match</span>}
                                                                </div>
                                                                {r.description && <p className="text-gray-400 text-xs leading-relaxed border-t border-gray-800 pt-2">{r.description}</p>}
                                                                {r.userId === myIdFromRedux && (
                                                                    <button
                                                                        onClick={async () => {
                                                                            await api.delete(`/referees/${r.id}`).catch(console.error);
                                                                            setRefereeListings(prev => prev.filter(x => x.id !== r.id));
                                                                        }}
                                                                        className="mt-3 text-red-500/60 hover:text-red-400 text-xs transition">
                                                                        🗑 {t('coaches.remove')}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <p className="text-white text-sm font-bold mb-2">{t('referees.matches_title')}</p>
                                            {refereeMatches.length === 0 ? (
                                                <p className="text-gray-600 text-sm text-center py-6">{t('referees.no_matches')}</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {refereeMatches.map(post => {
                                                        const isOffer = Array.isArray(post.positions) && post.positions.includes('REFEREE_OFFER');
                                                        const myApps = refAppsCache[post.id] || post.joinRequests || [];
                                                        return (
                                                            <div key={post.id} className={`bg-gray-900 border rounded-2xl p-4 ${isOffer ? 'border-green-500/30' : 'border-yellow-500/30'}`}>
                                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-8 h-8 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                                                            {post.sender?.username?.[0]?.toUpperCase()}
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-white text-sm font-bold">{post.sender?.fullName || post.sender?.username}</p>
                                                                            <p className="text-gray-500 text-xs">@{post.sender?.username}</p>
                                                                        </div>
                                                                    </div>
                                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${isOffer ? 'text-green-400 bg-green-500/10 border border-green-500/30' : 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/30'}`}>
                                                                        {isOffer ? `🟩 ${t('referees.offering')}` : `🟨 ${t('referees.seeking')}`}
                                                                    </span>
                                                                </div>
                                                                <div className="space-y-1 text-xs text-gray-400 mb-2">
                                                                    {post.matchDate && <p>📅 {new Date(post.matchDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{post.matchTime ? ` · ${post.matchTime}` : ''}</p>}
                                                                    {post.location && <p>📍 {post.location}</p>}
                                                                    {post.refereePayment && <p className="text-green-400 font-bold">💰 {post.refereePayment}</p>}
                                                                    {post.message && <p className="text-gray-300 italic">"{post.message}"</p>}
                                                                </div>

                                                                {post.senderId === myId ? (
                                                                    /* İlan sahibi — gelen hakemlik başvurularını/davete verilen yanıtları görür */
                                                                    <div className="space-y-2 border-t border-gray-800 pt-2">
                                                                        <p className="text-white text-xs font-bold">🟨 {t('referees.applications_title')}{myApps.length > 0 ? ` (${myApps.length})` : ''}</p>
                                                                        {myApps.length === 0 ? (
                                                                            <p className="text-gray-600 text-xs">{t('referees.no_applications')}</p>
                                                                        ) : myApps.map(app => {
                                                                            const theyInitiated = app.initiatedBy !== 'OWNER'; // JOINER = applied to me
                                                                            return (
                                                                                <div key={app.id} className="bg-gray-800/60 border border-gray-700 rounded-lg p-2.5">
                                                                                    <button onClick={() => navigate(`/profile/${app.user?.id}`)} className="flex items-center gap-1.5 mb-1 text-left">
                                                                                        <div className={`w-6 h-6 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                                                                                            {app.user?.username?.[0]?.toUpperCase()}
                                                                                        </div>
                                                                                        <span className="text-white text-xs font-bold truncate">{app.user?.fullName || app.user?.username}</span>
                                                                                        {app.offerPrice && <span className="text-yellow-400 text-xs font-black ml-auto">{app.offerPrice}</span>}
                                                                                    </button>
                                                                                    {app.offerMessage && <p className="text-gray-400 text-xs mb-1">{app.offerMessage}</p>}
                                                                                    {app.status === 'PENDING' && theyInitiated ? (
                                                                                        <>
                                                                                            <div className="flex gap-1.5">
                                                                                                <button disabled={respondingRefId === app.id}
                                                                                                    onClick={() => respondRefJoin(app.id, 'accept')}
                                                                                                    className="flex-1 bg-green-600/20 hover:bg-green-600/40 border border-green-500/40 text-green-400 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                                                    {t('referees.accept_btn')}
                                                                                                </button>
                                                                                                <button disabled={respondingRefId === app.id}
                                                                                                    onClick={() => setRefCounterInput({ requestId: app.id, price: '', message: '' })}
                                                                                                    className="flex-1 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                                                    {t('referees.counter_btn')}
                                                                                                </button>
                                                                                                <button disabled={respondingRefId === app.id}
                                                                                                    onClick={() => respondRefJoin(app.id, 'reject')}
                                                                                                    className="flex-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                                                    {t('referees.reject_btn')}
                                                                                                </button>
                                                                                            </div>
                                                                                            {refCounterInput.requestId === app.id && (
                                                                                                <div className="flex gap-1.5 mt-1.5">
                                                                                                    <input value={refCounterInput.price} onChange={e => setRefCounterInput(p => ({ ...p, price: e.target.value.replace(/[^0-9]/g, '') }))}
                                                                                                        placeholder={t('referees.counter_price_ph')} inputMode="numeric"
                                                                                                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500" />
                                                                                                    <button disabled={respondingRefId === app.id || !parseInt(refCounterInput.price)}
                                                                                                        onClick={() => respondRefJoin(app.id, 'counter', refCounterInput.price, refCounterInput.message)}
                                                                                                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-3 rounded-lg transition disabled:opacity-50">
                                                                                                        {t('referees.counter_send_btn')}
                                                                                                    </button>
                                                                                                </div>
                                                                                            )}
                                                                                        </>
                                                                                    ) : app.status === 'PENDING' ? (
                                                                                        <p className="text-gray-500 text-[11px]">{t('referees.counter_waiting')}</p>
                                                                                    ) : app.status === 'COUNTERED' && !theyInitiated ? (
                                                                                        <div>
                                                                                            <p className="text-purple-300 text-xs font-bold mb-1.5">{t('referees.countered_badge', { price: app.counterPrice })}</p>
                                                                                            <div className="flex gap-1.5">
                                                                                                <button disabled={respondingRefId === app.id}
                                                                                                    onClick={() => respondRefJoin(app.id, 'accept_counter')}
                                                                                                    className="flex-1 bg-green-600/20 hover:bg-green-600/40 border border-green-500/40 text-green-400 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                                                    {t('referees.accept_counter_btn')}
                                                                                                </button>
                                                                                                <button disabled={respondingRefId === app.id}
                                                                                                    onClick={() => respondRefJoin(app.id, 'reject_counter')}
                                                                                                    className="flex-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                                                    {t('referees.reject_counter_btn')}
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <p className="text-gray-500 text-[11px]">{t('referees.counter_waiting')}</p>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                ) : post._myJoinStatus === 'PENDING' && post._myJoinInitiatedBy === 'OWNER' ? (
                                                                    /* Davet edildim — kabul/red/karşı teklif sırası bende */
                                                                    <div className="border-t border-gray-800 pt-2 space-y-1.5">
                                                                        <p className="text-yellow-400 text-xs font-bold">{t('referees.invited_msg', { price: post._myJoinOfferPrice ? ` — ${post._myJoinOfferPrice}` : '' })}</p>
                                                                        <div className="flex gap-1.5">
                                                                            <button disabled={respondingRefId === post._myJoinRequestId}
                                                                                onClick={() => respondRefJoin(post._myJoinRequestId, 'accept')}
                                                                                className="flex-1 bg-green-600/20 hover:bg-green-600/40 border border-green-500/40 text-green-400 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                                {t('referees.accept_btn')}
                                                                            </button>
                                                                            <button disabled={respondingRefId === post._myJoinRequestId}
                                                                                onClick={() => setRefCounterInput({ requestId: post._myJoinRequestId, price: '', message: '' })}
                                                                                className="flex-1 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                                {t('referees.counter_btn')}
                                                                            </button>
                                                                            <button disabled={respondingRefId === post._myJoinRequestId}
                                                                                onClick={() => respondRefJoin(post._myJoinRequestId, 'reject')}
                                                                                className="flex-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                                {t('referees.reject_btn')}
                                                                            </button>
                                                                        </div>
                                                                        {refCounterInput.requestId === post._myJoinRequestId && (
                                                                            <div className="flex gap-1.5">
                                                                                <input value={refCounterInput.price} onChange={e => setRefCounterInput(p => ({ ...p, price: e.target.value.replace(/[^0-9]/g, '') }))}
                                                                                    placeholder={t('referees.counter_price_ph')} inputMode="numeric"
                                                                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500" />
                                                                                <button disabled={respondingRefId === post._myJoinRequestId || !parseInt(refCounterInput.price)}
                                                                                    onClick={() => respondRefJoin(post._myJoinRequestId, 'counter', refCounterInput.price, refCounterInput.message)}
                                                                                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-3 rounded-lg transition disabled:opacity-50">
                                                                                    {t('referees.counter_send_btn')}
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : post._myJoinStatus === 'COUNTERED' && post._myJoinInitiatedBy === 'JOINER' ? (
                                                                    /* Başvurdum, sahip karşı teklif verdi — kabul/red sırası bende */
                                                                    <div className="border-t border-gray-800 pt-2 space-y-1.5">
                                                                        <p className="text-purple-300 text-xs font-bold">{t('referees.countered_badge', { price: post._myJoinCounterPrice })}</p>
                                                                        <div className="flex gap-1.5">
                                                                            <button disabled={respondingRefId === post._myJoinRequestId}
                                                                                onClick={() => respondRefJoin(post._myJoinRequestId, 'accept_counter')}
                                                                                className="flex-1 bg-green-600/20 hover:bg-green-600/40 border border-green-500/40 text-green-400 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                                {t('referees.accept_counter_btn')}
                                                                            </button>
                                                                            <button disabled={respondingRefId === post._myJoinRequestId}
                                                                                onClick={() => respondRefJoin(post._myJoinRequestId, 'reject_counter')}
                                                                                className="flex-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                                {t('referees.reject_counter_btn')}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : post._myJoinStatus === 'PENDING' || post._myJoinStatus === 'COUNTERED' ? (
                                                                    <p className="text-gray-500 text-xs border-t border-gray-800 pt-2">
                                                                        {t('referees.my_application_pending', { price: post._myJoinOfferPrice ? ` (${post._myJoinOfferPrice})` : '' })}
                                                                    </p>
                                                                ) : post._myJoinStatus === 'ACCEPTED' ? (
                                                                    <p className="text-green-400 text-xs font-bold border-t border-gray-800 pt-2">✅ {t('referees.accepted_badge')}</p>
                                                                ) : refApplyForm.postId === post.id ? (
                                                                    <div className="border-t border-gray-800 pt-2 space-y-1.5">
                                                                        <input value={refApplyForm.price} onChange={e => setRefApplyForm(f => ({ ...f, price: e.target.value.replace(/[^0-9]/g, '') }))}
                                                                            placeholder={t('referees.apply_price_ph')} inputMode="numeric"
                                                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500" />
                                                                        <input value={refApplyForm.message} onChange={e => setRefApplyForm(f => ({ ...f, message: e.target.value }))}
                                                                            placeholder={t('referees.apply_msg_ph')}
                                                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500" />
                                                                        <button disabled={submittingRefApply}
                                                                            onClick={() => applyAsReferee(post.id)}
                                                                            className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-2 rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50`}>
                                                                            {submittingRefApply ? '...' : t('referees.apply_btn')}
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => setRefApplyForm({ postId: post.id, price: '', message: '' })}
                                                                        className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-2 rounded-xl text-sm hover:opacity-90 transition`}>
                                                                        🟨 {t('referees.apply')}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : shownCoaches.length === 0 && !coachForm ? (
                                    <div className="text-center py-12 bg-gray-900 rounded-2xl border border-gray-800">
                                        <p className="text-4xl mb-3">🎓</p>
                                        <p className="text-gray-400 text-sm">{coachSubTab === 'cvs' ? t('coaches.no_cv_yet') : t('coaches.no_coaches')}</p>
                                        {coachSubTab !== 'cvs' && (
                                            <button onClick={() => setCoachForm(true)} className="mt-3 text-purple-400 hover:text-purple-300 text-sm transition">
                                                {t('coaches.be_first')}
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {shownCoaches.map(c => {
                                            const cred = credOf(c.credentialLevel);
                                            const days = Array.isArray(c.days) ? c.days : [];
                                            return (
                                                <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                                                    {/* Header */}
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                                                                {c.user?.username?.[0]?.toUpperCase() || '?'}
                                                            </div>
                                                            <div>
                                                                <p className="text-white font-bold text-sm">{c.user?.fullName || c.user?.username}</p>
                                                                <p className="text-gray-500 text-xs">@{c.user?.username}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className={`text-xs font-bold ${cred.color}`}>{cred.emoji} {cred.label}</span>
                                                            {c.certName && <span className="text-gray-500 text-[10px]">{c.certName}</span>}
                                                            {c.experience > 0 && <span className="text-gray-600 text-[10px]">{t(c.experience !== 1 ? 'coaches.exp_years_plural' : 'coaches.exp_years', { n: c.experience })}</span>}
                                                        </div>
                                                    </div>

                                                    {/* Lesson types + price */}
                                                    <div className="flex gap-2 mb-3 flex-wrap">
                                                        {c.individual && (
                                                            <span className="flex items-center gap-1 bg-purple-600/15 border border-purple-500/30 text-purple-300 text-xs font-bold px-2.5 py-1 rounded-lg">
                                                                👤 {t('coaches.individual')}
                                                                {c.priceIndividual > 0 && <span className="text-purple-400 ml-1">₺{c.priceIndividual}/hr</span>}
                                                            </span>
                                                        )}
                                                        {c.group && (
                                                            <span className="flex items-center gap-1 bg-blue-600/15 border border-blue-500/30 text-blue-300 text-xs font-bold px-2.5 py-1 rounded-lg">
                                                                👥 {t('coaches.max_students', { n: c.maxGroupSize })}
                                                                {c.priceGroup > 0 && <span className="text-blue-400 ml-1">₺{c.priceGroup}/person</span>}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Location + time */}
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                                                        <span className="text-gray-400 text-xs">📍 {c.location}{c.city ? `, ${c.city}` : ''}</span>
                                                        <span className="text-gray-400 text-xs">🕐 {c.timeFrom} — {c.timeTo}</span>
                                                    </div>

                                                    {/* Days */}
                                                    {days.length > 0 && (
                                                        <div className="flex gap-1 flex-wrap mb-3">
                                                            {DAYS.map(d => (
                                                                <span key={d} className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                                                                    ${days.includes(d) ? `bg-gradient-to-r ${config.color} text-white` : 'bg-gray-800 text-gray-600'}`}>
                                                                    {DAY_LABEL[d]}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Description */}
                                                    {c.description && (
                                                        <p className="text-gray-400 text-xs leading-relaxed border-t border-gray-800 pt-3">{c.description}</p>
                                                    )}

                                                    {/* CV */}
                                                    {c.cvUrl && (
                                                        <a href={c.cvUrl} target="_blank" rel="noopener noreferrer"
                                                            className="mt-2 inline-block text-purple-400 hover:text-purple-300 text-xs font-bold transition">
                                                            📄 {t('coaches.view_cv')}
                                                        </a>
                                                    )}

                                                    {/* Delete (own listing) */}
                                                    {c.userId === myIdFromRedux && (
                                                        <button
                                                            onClick={async () => {
                                                                await api.delete(`/coaches/${c.id}`).catch(console.error);
                                                                setCoachListings(prev => prev.filter(x => x.id !== c.id));
                                                            }}
                                                            className="mt-3 text-red-500/60 hover:text-red-400 text-xs transition">
                                                            🗑 {t('coaches.remove')}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* MEDIA TAB */}
                    {activeTab === 'media' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-white font-bold">📷 {t('media.title')}</h3>
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className={`bg-gradient-to-r ${config.color} text-white font-bold px-4 py-2 rounded-xl text-sm hover:opacity-90 transition`}
                                >
                                    {t('media.share')}
                                </button>
                            </div>
                            {mediaPosts.length === 0 ? (
                                <div className="text-center py-12 bg-gray-900 rounded-2xl border border-gray-800">
                                    <p className="text-4xl mb-3">📷</p>
                                    <p className="text-gray-400">{t('media.no_media')}</p>
                                    <button onClick={() => setShowCreateModal(true)} className="mt-3 text-purple-400 hover:text-purple-300 text-sm transition">
                                        {t('media.share_cta')}
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {mediaPosts.map(post => (
                                        <div key={post.id} className="relative rounded-2xl overflow-hidden aspect-square bg-gray-900 border border-gray-800 group cursor-pointer"
                                            onClick={() => setViewingContent(post)}>
                                            {post.videoUrl ? (
                                                <video src={post.videoUrl} className="w-full h-full object-cover"
                                                    muted playsInline
                                                    onMouseEnter={e => e.target.play()}
                                                    onMouseLeave={e => { e.target.pause(); e.target.currentTime = 0; }} />
                                            ) : (
                                                <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
                                            )}
                                            {post.type === 'REEL' && (
                                                <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">🎬</div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition">
                                                <div className="absolute bottom-2 left-2 right-2">
                                                    <p className="text-white text-xs font-bold truncate">@{post.user?.username}</p>
                                                    {post.content && <p className="text-gray-300 text-xs truncate">{post.content}</p>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* REFEREE TAB — football only */}
                    {activeTab === 'referee' && sub === 'football' && (() => {
                        const refereeNeeded = playerWantedPosts.filter(p =>
                            Array.isArray(p.positions) && p.positions.includes('REFEREE') && !p.positions.includes('REFEREE_OFFER')
                        );
                        const refereeOffers = playerWantedPosts.filter(p =>
                            Array.isArray(p.positions) && p.positions.includes('REFEREE_OFFER')
                        );
                        // Accepted referee assignments — user is sender or participant on a REFEREE listing
                        const myRefereeJobs = upcomingMatches.filter(m =>
                            Array.isArray(m.positions) && m.positions.includes('REFEREE')
                        );

                        const RefereeNeededForm = ({ onClose, onPosted }) => {
                            const DURATIONS = [
                                { value: 60,  label: '60 min' },
                                { value: 90,  label: '90 min' },
                                { value: 120, label: '120 min' },
                                { value: 999, label: '120 min + ET' },
                            ];
                            const [f, setF] = useState({ matchDate: '', matchTime: '', duration: 90, location: '', teamSize: 5, fee: '', message: '' });
                            const [submitting, setSubmitting] = useState(false);
                            return (
                                <div className="bg-gray-900 border border-yellow-500/30 rounded-2xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-white font-bold">📋 Need a Referee</p>
                                        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="date" onClick={e => e.target.showPicker?.()} value={f.matchDate} onChange={e => setF(p => ({ ...p, matchDate: e.target.value }))}
                                            className="bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-yellow-500" />
                                        <TimeSelect value={f.matchTime} onChange={v => setF(p => ({ ...p, matchTime: v }))} className="w-full" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <span className="text-gray-400 text-xs">Match duration:</span>
                                        <div className="flex gap-2">
                                            {DURATIONS.map(d => (
                                                <button key={d.value} type="button" onClick={() => setF(p => ({ ...p, duration: d.value }))}
                                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${f.duration === d.value ? 'bg-yellow-500 border-yellow-500 text-black' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-yellow-500/50'}`}>
                                                    {d.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <input value={f.location} onChange={e => setF(p => ({ ...p, location: e.target.value }))}
                                        placeholder="City / Location"
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-yellow-500" />
                                    <div className="space-y-1.5">
                                        <span className="text-gray-400 text-xs">Match size:</span>
                                        <div className="flex flex-wrap gap-2">
                                            {[2,3,4,5,6,7,8,9,10,11].map(n => (
                                                <button key={n} type="button" onClick={() => setF(p => ({ ...p, teamSize: n }))}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${f.teamSize === n ? 'bg-yellow-500 border-yellow-500 text-black' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-yellow-500/50'}`}>
                                                    {n}v{n}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <input value={f.fee} onChange={e => setF(p => ({ ...p, fee: e.target.value }))}
                                        placeholder="Fee offered (e.g. 300 TL, negotiable...)"
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-yellow-500" />
                                    <textarea value={f.message} onChange={e => setF(p => ({ ...p, message: e.target.value }))}
                                        placeholder="Additional info (e.g. league, experience required...)"
                                        rows={2}
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-yellow-500 resize-none" />
                                    <button disabled={submitting || !f.matchDate || !f.location}
                                        onClick={async () => {
                                            setSubmitting(true);
                                            try {
                                                const { data } = await api.post('/rivals', {
                                                    category: categoryUpper, subCategory: sub,
                                                    matchType: 'PLAYER_WANTED', matchMode: 'PRACTICE',
                                                    teamSize: f.teamSize, surface: 'HALI_SAHA',
                                                    positions: ['REFEREE'], refereePayment: f.fee,
                                                    matchDate: f.matchDate, matchTime: f.matchTime,
                                                    duration: f.duration === 999 ? 150 : f.duration,
                                                    location: f.location, message: f.message || null,
                                                });
                                                onPosted(data);
                                            } catch (e) { console.error(e); } finally { setSubmitting(false); }
                                        }}
                                        className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-2.5 rounded-xl text-sm transition disabled:opacity-50">
                                        {submitting ? 'Posting...' : '📋 Post Referee Listing'}
                                    </button>
                                </div>
                            );
                        };

                        const RefereeCvForm = ({ onClose, onPosted }) => {
                            const [f, setF] = useState({ experience: '', certifications: '', rate: '', availability: '', bio: '' });
                            const [submitting, setSubmitting] = useState(false);
                            return (
                                <div className="bg-gray-900 border border-green-500/30 rounded-2xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-white font-bold">🟩 I'm a Referee — Post My Profile</p>
                                        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
                                    </div>
                                    <input value={f.experience} onChange={e => setF(p => ({ ...p, experience: e.target.value }))}
                                        placeholder="Years of experience (e.g. 5 years, UEFA C license...)"
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500" />
                                    <input value={f.certifications} onChange={e => setF(p => ({ ...p, certifications: e.target.value }))}
                                        placeholder="Certifications (e.g. TFF Grassroots, UEFA B...)"
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500" />
                                    <input value={f.rate} onChange={e => setF(p => ({ ...p, rate: e.target.value }))}
                                        placeholder="Rate per match (e.g. 300 TL, negotiable...)"
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500" />
                                    <input value={f.availability} onChange={e => setF(p => ({ ...p, availability: e.target.value }))}
                                        placeholder="Availability (e.g. Weekends, evenings...)"
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500" />
                                    <textarea value={f.bio} onChange={e => setF(p => ({ ...p, bio: e.target.value }))}
                                        placeholder="Short bio / notes..."
                                        rows={2}
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500 resize-none" />
                                    <button disabled={submitting || !f.rate}
                                        onClick={async () => {
                                            setSubmitting(true);
                                            try {
                                                const { data } = await api.post('/rivals', {
                                                    category: categoryUpper, subCategory: sub,
                                                    matchType: 'PLAYER_WANTED', matchMode: 'PRACTICE',
                                                    teamSize: 1, surface: 'HALI_SAHA',
                                                    positions: ['REFEREE_OFFER'],
                                                    refereePayment: f.rate,
                                                    message: [
                                                        f.experience && `Experience: ${f.experience}`,
                                                        f.certifications && `Certifications: ${f.certifications}`,
                                                        f.availability && `Availability: ${f.availability}`,
                                                        f.bio,
                                                    ].filter(Boolean).join(' · '),
                                                });
                                                onPosted(data);
                                            } catch (e) { console.error(e); } finally { setSubmitting(false); }
                                        }}
                                        className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-2.5 rounded-xl text-sm transition disabled:opacity-50">
                                        {submitting ? 'Posting...' : '🟩 Post My Referee Profile'}
                                    </button>
                                </div>
                            );
                        };

                        const filteredOffers  = refereesLocFilter.trim()
                            ? refereeOffers.filter(p => p.location?.toLowerCase().includes(refereesLocFilter.trim().toLowerCase()))
                            : refereeOffers;
                        const filteredNeeded  = listingsLocFilter.trim()
                            ? refereeNeeded.filter(p => p.location?.toLowerCase().includes(listingsLocFilter.trim().toLowerCase()))
                            : refereeNeeded;

                        return (
                            <div className="space-y-4">
                                {/* Header: title + post buttons */}
                                <div className="flex items-center justify-between">
                                    <h3 className="text-white font-bold">🟨 Find Referee</h3>
                                    <div className="flex gap-2">
                                        <button onClick={() => setRefereeForm(v => v === 'cv' ? null : 'cv')}
                                            className="bg-green-600/20 hover:bg-green-600/40 border border-green-500/40 text-green-400 font-bold text-xs px-3 py-1.5 rounded-xl transition">
                                            🟩 I'm a Referee
                                        </button>
                                        <button onClick={() => setRefereeForm(v => v === 'needed' ? null : 'needed')}
                                            className="bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-400 font-bold text-xs px-3 py-1.5 rounded-xl transition">
                                            📋 Need a Referee
                                        </button>
                                    </div>
                                </div>

                                {/* Inline forms */}
                                {refereeForm === 'needed' && (
                                    <RefereeNeededForm
                                        onClose={() => setRefereeForm(null)}
                                        onPosted={(data) => {
                                            setPlayerWantedPosts(prev => [data, ...prev]);
                                            setRefereeForm(null);
                                        }}
                                    />
                                )}
                                {refereeForm === 'cv' && (
                                    <RefereeCvForm
                                        onClose={() => setRefereeForm(null)}
                                        onPosted={(data) => {
                                            setPlayerWantedPosts(prev => [data, ...prev]);
                                            setRefereeForm(null);
                                        }}
                                    />
                                )}

                                {/* Sub-tab switcher */}
                                <div className="flex rounded-xl overflow-hidden border border-gray-700">
                                    <button
                                        onClick={() => setRefereeSubTab('referees')}
                                        className={`flex-1 py-2 text-xs font-bold transition ${refereeSubTab === 'referees' ? 'bg-green-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}
                                    >
                                        🟩 Referees {refereeOffers.length > 0 && `(${refereeOffers.length})`}
                                    </button>
                                    <button
                                        onClick={() => setRefereeSubTab('listings')}
                                        className={`flex-1 py-2 text-xs font-bold transition ${refereeSubTab === 'listings' ? 'bg-yellow-500 text-black' : 'bg-gray-900 text-gray-400 hover:text-white'}`}
                                    >
                                        📋 Referee Listings {refereeNeeded.length > 0 && `(${refereeNeeded.length})`}
                                    </button>
                                </div>

                                {/* REFEREES sub-tab */}
                                {refereeSubTab === 'referees' && (
                                    <div className="space-y-3">
                                        <input
                                            value={refereesLocFilter}
                                            onChange={e => setRefereesLocFilter(e.target.value)}
                                            placeholder="🔍 Filter by location..."
                                            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500"
                                        />
                                        {filteredOffers.length === 0 ? (
                                            <div className="text-center py-14 bg-gray-900 rounded-2xl border border-gray-800">
                                                <p className="text-4xl mb-2">🟩</p>
                                                <p className="text-white font-bold mb-1">No referees yet</p>
                                                <p className="text-gray-400 text-sm">{refereesLocFilter ? 'No match for this location.' : 'Referees who post their profiles will appear here.'}</p>
                                            </div>
                                        ) : filteredOffers.map(post => (
                                            <div key={post.id} className="bg-gray-900 border border-green-500/30 rounded-2xl p-4">
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-9 h-9 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                                            {post.sender?.username?.[0]?.toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="text-white text-sm font-bold">{post.sender?.fullName || post.sender?.username}</p>
                                                            <p className="text-gray-500 text-xs">@{post.sender?.username}</p>
                                                        </div>
                                                    </div>
                                                    <span className="text-green-400 text-xs font-bold bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded-full flex-shrink-0">🟩 Available</span>
                                                </div>
                                                <div className="space-y-1 text-xs text-gray-400 mb-3">
                                                    {post.refereePayment && <p className="text-green-400 font-bold">💰 {post.refereePayment}</p>}
                                                    {post.location && <p>📍 {post.location}</p>}
                                                    {post.message && <p className="text-gray-300">{post.message}</p>}
                                                </div>
                                                {post.senderId !== myId && (
                                                    <button
                                                        onClick={() => navigate(`/messages/${post.senderId}`)}
                                                        className="w-full flex items-center justify-center gap-2 bg-green-600/20 hover:bg-green-600/40 border border-green-500/40 text-green-400 font-bold py-2 rounded-xl text-sm transition"
                                                    >
                                                        💬 Send Message
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* REFEREE LISTINGS sub-tab */}
                                {refereeSubTab === 'listings' && (
                                    <div className="space-y-3">
                                        <input
                                            value={listingsLocFilter}
                                            onChange={e => setListingsLocFilter(e.target.value)}
                                            placeholder="🔍 Filter by location..."
                                            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-yellow-500"
                                        />
                                        {filteredNeeded.length === 0 ? (
                                            <div className="text-center py-14 bg-gray-900 rounded-2xl border border-gray-800">
                                                <p className="text-4xl mb-2">📋</p>
                                                <p className="text-white font-bold mb-1">No referee listings yet</p>
                                                <p className="text-gray-400 text-sm">{listingsLocFilter ? 'No match for this location.' : 'Teams looking for a referee will appear here.'}</p>
                                            </div>
                                        ) : filteredNeeded.map(post => (
                                            <div key={post.id} className="bg-gray-900 border border-yellow-500/30 rounded-2xl p-4">
                                                <div className="flex items-start justify-between gap-2 mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-9 h-9 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                                            {post.sender?.username?.[0]?.toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="text-white text-sm font-bold">{post.sender?.fullName || post.sender?.username}</p>
                                                            <p className="text-gray-500 text-xs">@{post.sender?.username}</p>
                                                        </div>
                                                    </div>
                                                    <span className="text-yellow-400 text-xs font-bold bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 rounded-full flex-shrink-0">🟨 Referee Needed</span>
                                                </div>
                                                <div className="space-y-1 text-xs text-gray-400 mb-3">
                                                    {post.teamSize && <p>⚽ {post.teamSize}v{post.teamSize}</p>}
                                                    {post.matchDate && <p>📅 {new Date(post.matchDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{post.matchTime ? ` · ${post.matchTime}` : ''}</p>}
                                                    {post.duration && <p>⏱️ {post.duration === 150 ? '120 min + Extra Time' : `${post.duration} min`}</p>}
                                                    {post.location && <p>📍 {post.location}</p>}
                                                    {post.courtName && <p>🏟️ {post.courtName}</p>}
                                                    {post.refereePayment
                                                        ? <p className="text-green-400 font-bold">💰 Fee: {post.refereePayment}</p>
                                                        : <p className="text-gray-600">💰 Fee not specified</p>}
                                                    {post.message && <p className="text-gray-300 italic">"{post.message}"</p>}
                                                </div>
                                                {post.senderId !== myId && (
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await api.post(`/rivals/${post.id}/respond`, {});
                                                                alert('✅ Application sent!');
                                                            } catch (e) {
                                                                alert(e?.response?.data?.message || 'Error occurred.');
                                                            }
                                                        }}
                                                        className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-2.5 rounded-xl text-sm hover:opacity-90 transition`}
                                                    >
                                                        🟨 Apply as Referee
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Upcoming Referee Assignments */}
                                {myRefereeJobs.length > 0 && (
                                    <div className="mt-2">
                                        <p className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-2">🟨 Upcoming Referee Assignments ({myRefereeJobs.length})</p>
                                        <div className="space-y-3">
                                            {myRefereeJobs.map(m => {
                                                const isReferee = Array.isArray(m.participants) && m.participants.some(p => p.id === myId);
                                                return (
                                                    <div key={m.id} className="bg-gray-900 border border-yellow-500/40 rounded-2xl p-4">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-yellow-400 text-xs font-black uppercase tracking-wide">🟨 {isReferee ? 'You are the Referee' : 'Your Listing — Matched'}</span>
                                                            <span className="text-green-400 text-xs font-bold bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded-full">✓ Confirmed</span>
                                                        </div>
                                                        <div className="space-y-1 text-xs text-gray-400">
                                                            {m.teamSize && <p>⚽ {m.teamSize}v{m.teamSize}</p>}
                                                            {m.matchDate && (
                                                                <p>📅 {new Date(m.matchDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{m.matchTime ? ` · ${m.matchTime}` : ''}</p>
                                                            )}
                                                            {m.duration && <p>⏱️ {m.duration === 150 ? '120 min + Extra Time' : `${m.duration} min`}</p>}
                                                            {m.location && <p>📍 {m.location}</p>}
                                                            {m.refereePayment && <p className="text-green-400 font-bold">💰 {m.refereePayment}</p>}
                                                        </div>
                                                        <div className="mt-3 pt-3 border-t border-gray-800 flex items-center gap-2">
                                                            <div className={`w-7 h-7 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                                                                {m.sender?.username?.[0]?.toUpperCase()}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-white text-xs font-bold truncate">{m.sender?.fullName || m.sender?.username}</p>
                                                                <p className="text-gray-500 text-[10px]">Match organizer</p>
                                                            </div>
                                                            {isReferee && m.senderId !== myId && (
                                                                <button
                                                                    onClick={() => navigate(`/messages/${m.senderId}`)}
                                                                    className="bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 text-blue-400 font-bold text-xs px-3 py-1.5 rounded-xl transition"
                                                                >
                                                                    💬 Message
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* EQUIPMENT TAB — tennis/padel ikinci el / sıfır ekipman ilanları */}
                    {activeTab === 'equipment' && EQUIPMENT_SPORTS.has(sub) && (
                        <div className="space-y-3">
                            <div className="flex justify-end">
                                <CityAlertBtn tab="equipment" desc="Şehrinde yeni ekipman ilanı açılınca bildirim al" />
                            </div>
                            <div className="flex gap-2">
                                {['ACTIVE', 'SOLD'].map(v => (
                                    <button key={v} onClick={() => setEquipmentViewStatus(v)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition ${equipmentViewStatus === v ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                                        {v === 'ACTIVE' ? (t('equipment.active_tab') || 'Aktif') : (t('equipment.sold_tab') || 'Satılanlar')}
                                    </button>
                                ))}
                            </div>

                            {equipmentViewStatus === 'ACTIVE' && (
                                <button
                                    onClick={() => setShowEquipmentForm(true)}
                                    className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-2.5 rounded-xl text-sm hover:opacity-90 transition`}
                                >
                                    + {t('equipment.new_listing') || 'Yeni İlan Ver'}
                                </button>
                            )}

                            {loadingEquipment ? (
                                <p className="text-gray-500 text-sm text-center py-8">{t('common.loading')}</p>
                            ) : equipmentListings.length === 0 ? (
                                equipmentLoaded && (
                                    <div className="text-center py-14 bg-gray-900 rounded-2xl border border-gray-800">
                                        <p className="text-4xl mb-2">🎾</p>
                                        <p className="text-white font-bold mb-1">
                                            {equipmentViewStatus === 'SOLD' ? (t('equipment.no_sold') || 'Satılan ürün yok') : (t('equipment.empty') || 'Henüz ekipman ilanı yok')}
                                        </p>
                                    </div>
                                )
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {equipmentListings.map(eq => (
                                        <button key={eq.id} onClick={() => setSelectedEquipment(eq)}
                                            className="text-left bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition relative">
                                            {eq.images?.[0] ? (
                                                <img src={eq.images[0]} alt="" className="w-full h-28 object-cover" />
                                            ) : (
                                                <div className="w-full h-28 bg-gray-800 flex items-center justify-center text-3xl">🎾</div>
                                            )}
                                            {eq.status === 'SOLD' && (
                                                <div className="absolute top-1.5 right-1.5 bg-gray-700 text-gray-200 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                                    {t('equipment.sold_badge') || 'Satıldı'}
                                                </div>
                                            )}
                                            {eq.status === 'RESERVED' && (
                                                <div className="absolute top-1.5 right-1.5 bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                                    {t('equipment.reserved_short_badge') || 'Rezerve'}
                                                </div>
                                            )}
                                            <div className="p-2.5">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${eq.condition === 'NEW' ? 'bg-green-600 text-white' : 'bg-yellow-600 text-black'}`}>
                                                        {eq.condition === 'NEW' ? (t('equipment.new') || 'Sıfır') : (t('equipment.used') || 'İkinci El')}
                                                    </span>
                                                    {eq.offerCount > 0 && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-600/30 text-purple-300">💰 {eq.offerCount}</span>
                                                    )}
                                                </div>
                                                <p className="text-white text-xs font-bold truncate">{eq.title}</p>
                                                <p className={`text-sm font-black mt-0.5`} style={{ color: undefined }}>
                                                    <span className="bg-gradient-to-r bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(to right, #a855f7, #ec4899)' }}>
                                                        {eq.price > 0 ? `${eq.price} ₺` : (t('equipment.ask_price') || 'Fiyat sor')}
                                                    </span>
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Ekipman ilanı oluştur modalı */}
                    {showEquipmentForm && (
                        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowEquipmentForm(false)}>
                            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-white font-black text-lg">{t('equipment.new_listing') || 'Yeni İlan Ver'}</h3>
                                    <button onClick={() => setShowEquipmentForm(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
                                </div>
                                <div className="flex gap-2 mb-3">
                                    {['NEW', 'USED'].map(c => (
                                        <button key={c} onClick={() => setEquipmentForm(f => ({ ...f, condition: c }))}
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${equipmentForm.condition === c ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                                            {c === 'NEW' ? '🆕 Sıfır' : '♻️ İkinci El'}
                                        </button>
                                    ))}
                                </div>
                                <input value={equipmentForm.title} onChange={e => setEquipmentForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder={`${t('equipment.product_name') || 'Ürün adı'} *`}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-2.5 focus:outline-none focus:border-purple-500" />
                                <input value={equipmentForm.price} onChange={e => setEquipmentForm(f => ({ ...f, price: e.target.value.replace(/[^0-9]/g, '') }))}
                                    placeholder={`${t('equipment.price') || 'Fiyat (₺)'} *`} inputMode="numeric"
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-2.5 focus:outline-none focus:border-purple-500" />
                                <textarea value={equipmentForm.description} onChange={e => setEquipmentForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder={`${t('equipment.description') || 'Açıklama'} * (min. 5 ${t('equipment.chars') || 'karakter'})`} rows={3}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-2.5 focus:outline-none focus:border-purple-500" />
                                <input value={equipmentForm.location} onChange={e => setEquipmentForm(f => ({ ...f, location: e.target.value }))}
                                    placeholder={`${t('equipment.location') || 'Konum / Şehir'} *`}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-purple-500" />

                                <input type="file" accept="image/*" multiple
                                    onChange={e => setEquipmentFiles(prev => [...prev, ...Array.from(e.target.files || [])].slice(0, 5))}
                                    className="w-full text-xs text-gray-400 mb-2" />
                                {equipmentFiles.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {equipmentFiles.map((f, idx) => (
                                            <div key={idx} className="relative">
                                                <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 rounded-lg object-cover" />
                                                <button onClick={() => setEquipmentFiles(prev => prev.filter((_, i) => i !== idx))}
                                                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">✕</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <p className="text-gray-500 text-[11px] mb-3">* {t('equipment.photo_required') || 'En az 1 fotoğraf eklemelisiniz'}</p>

                                <button onClick={submitEquipment} disabled={submittingEquipment}
                                    className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-2.5 rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50`}>
                                    {submittingEquipment ? '...' : (t('equipment.publish') || 'İlanı Yayınla')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Ekipman ilanı detay modalı */}
                    {selectedEquipment && (
                        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => { setSelectedEquipment(null); setShowOfferForm(false); }}>
                            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${selectedEquipment.condition === 'NEW' ? 'bg-green-600 text-white' : 'bg-yellow-600 text-black'}`}>
                                        {selectedEquipment.condition === 'NEW' ? (t('equipment.new') || 'Sıfır') : (t('equipment.used') || 'İkinci El')}
                                    </span>
                                    <button onClick={() => { setSelectedEquipment(null); setShowOfferForm(false); }} className="text-gray-400 hover:text-white text-xl">✕</button>
                                </div>
                                {selectedEquipment.images?.length > 0 && (
                                    <div className="flex gap-2 overflow-x-auto mb-3">
                                        {selectedEquipment.images.map((img, idx) => (
                                            <img key={idx} src={img} alt="" className="w-full max-w-[280px] h-48 rounded-xl object-cover flex-shrink-0" />
                                        ))}
                                    </div>
                                )}
                                <h3 className="text-white font-black text-lg mb-1">{selectedEquipment.title}</h3>
                                <p className="text-purple-300 text-xl font-black mb-2">{selectedEquipment.price > 0 ? `${selectedEquipment.price} ₺` : (t('equipment.ask_price') || 'Fiyat sor')}</p>
                                {selectedEquipment.description && <p className="text-gray-300 text-sm mb-2">{selectedEquipment.description}</p>}
                                {selectedEquipment.location && <p className="text-gray-500 text-xs mb-3">📍 {selectedEquipment.location}</p>}
                                <div className="flex items-center gap-2 mb-3 pt-3 border-t border-gray-800">
                                    <div className={`w-8 h-8 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                        {selectedEquipment.user?.username?.[0]?.toUpperCase()}
                                    </div>
                                    <p className="text-white text-sm font-bold">{selectedEquipment.user?.fullName || selectedEquipment.user?.username}</p>
                                </div>

                                {selectedEquipment.status === 'SOLD' && (
                                    <div className="bg-gray-700/20 rounded-lg py-1.5 text-center mb-3">
                                        <p className="text-gray-400 font-bold text-sm">{t('equipment.sold_badge') || 'Satıldı'}</p>
                                    </div>
                                )}
                                {selectedEquipment.status === 'RESERVED' && selectedEquipment.reservedUntil && (
                                    <div className="bg-amber-500/20 rounded-lg py-1.5 text-center mb-3">
                                        <p className="text-amber-400 font-bold text-sm">
                                            {t(selectedEquipment.reservedForUserId === myId ? 'equipment.reserved_for_you_badge' : 'equipment.reserved_badge',
                                                { date: new Date(selectedEquipment.reservedUntil).toLocaleDateString('tr-TR') })}
                                        </p>
                                    </div>
                                )}

                                {selectedEquipment.userId === myId ? (
                                    <>
                                        <p className="text-white text-sm font-bold mb-2">💰 {t('equipment.offers_title') || 'Gelen Teklifler'}{equipmentOffers.length > 0 ? ` (${equipmentOffers.length})` : ''}</p>
                                        {loadingEquipmentOffers ? (
                                            <p className="text-gray-500 text-xs mb-3">{t('common.loading')}</p>
                                        ) : equipmentOffers.length === 0 ? (
                                            <p className="text-gray-500 text-xs mb-3">{t('equipment.no_offers') || 'Henüz teklif yok'}</p>
                                        ) : (
                                            <div className="space-y-2 mb-3">
                                                {equipmentOffers.map(off => (
                                                    <div key={off.id} className="bg-gray-900 border border-gray-800 rounded-lg p-2.5">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <button onClick={() => navigate(`/profile/${off.fromUser?.id}`)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
                                                                <div className={`w-6 h-6 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                                                                    {off.fromUser?.username?.[0]?.toUpperCase()}
                                                                </div>
                                                                <span className="text-white text-xs font-bold truncate">{off.fromUser?.fullName || off.fromUser?.username}</span>
                                                            </button>
                                                            <button onClick={() => openChatWithSeller(selectedEquipment, off.fromUser?.id)} className="text-sm px-1">💬</button>
                                                            <span className="text-purple-300 text-sm font-black flex-shrink-0">{off.price}₺</span>
                                                        </div>
                                                        {off.message && <p className="text-gray-400 text-xs mt-1">{off.message}</p>}
                                                        {off.status === 'PENDING' ? (
                                                            <>
                                                                <div className="flex gap-1.5 mt-2">
                                                                    <button disabled={respondingOfferId === off.id}
                                                                        onClick={() => setAcceptDateModal({ visible: true, offerId: off.id, date: '' })}
                                                                        className="flex-1 bg-green-600/20 hover:bg-green-600/40 border border-green-500/40 text-green-400 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                        {t('equipment.offer_accept') || 'Kabul Et'}
                                                                    </button>
                                                                    <button disabled={respondingOfferId === off.id}
                                                                        onClick={() => setCounterInput({ visible: true, offerId: off.id, price: '' })}
                                                                        className="flex-1 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                        {t('equipment.counter_btn') || 'Karşı Teklif'}
                                                                    </button>
                                                                    <button disabled={respondingOfferId === off.id}
                                                                        onClick={() => respondEquipmentOffer(off.id, 'reject')}
                                                                        className="flex-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                        {t('equipment.offer_reject') || 'Reddet'}
                                                                    </button>
                                                                </div>
                                                                {counterInput.visible && counterInput.offerId === off.id && (
                                                                    <div className="flex gap-1.5 mt-2">
                                                                        <input value={counterInput.price} onChange={e => setCounterInput(p => ({ ...p, price: e.target.value.replace(/[^0-9]/g, '') }))}
                                                                            placeholder={t('equipment.counter_price_ph') || 'Karşı teklif (₺)'} inputMode="numeric"
                                                                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500" />
                                                                        <button disabled={respondingOfferId === off.id || !parseInt(counterInput.price)}
                                                                            onClick={() => respondEquipmentOffer(off.id, 'counter', undefined, parseInt(counterInput.price))}
                                                                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-3 rounded-lg transition disabled:opacity-50">
                                                                            {t('equipment.counter_send_btn') || 'Gönder'}
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : off.status === 'COUNTERED' ? (
                                                            <>
                                                                <p className="text-purple-300 text-xs font-bold mt-1.5">{t('equipment.countered_badge', { price: off.counterPrice })}</p>
                                                                <p className="text-gray-500 text-[11px] mt-0.5">{t('equipment.counter_waiting_msg') || 'Karşı tarafın yanıtı bekleniyor'}</p>
                                                            </>
                                                        ) : (
                                                            <p className={`text-[11px] font-bold mt-1.5 ${off.status === 'ACCEPTED' ? 'text-green-400' : 'text-red-400'}`}>
                                                                {off.status === 'ACCEPTED' ? (t('equipment.offer_accepted_badge') || 'Kabul edildi') : (t('equipment.offer_rejected_badge') || 'Reddedildi')}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {selectedEquipment.status === 'RESERVED' && (
                                            <button disabled={equipmentActionLoading}
                                                onClick={() => cancelEquipmentReservation(selectedEquipment.id)}
                                                className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-bold py-2 rounded-xl text-sm transition mb-2 disabled:opacity-50">
                                                {t('equipment.cancel_reserve_btn') || 'Rezervasyonu İptal Et'}
                                            </button>
                                        )}
                                        {selectedEquipment.status !== 'SOLD' && (
                                            <button disabled={equipmentActionLoading}
                                                onClick={() => { if (confirm(t('equipment.mark_sold_confirm_msg') || 'Bu ilanı satıldı olarak işaretlemek istiyor musunuz?')) markEquipmentSold(selectedEquipment.id); }}
                                                className="w-full bg-green-600/20 hover:bg-green-600/40 border border-green-500/40 text-green-400 font-bold py-2 rounded-xl text-sm transition mb-2 disabled:opacity-50">
                                                {t('equipment.mark_sold_btn') || 'Satıldı Olarak İşaretle'}
                                            </button>
                                        )}
                                        <button onClick={() => deleteEquipment(selectedEquipment.id)}
                                            className="w-full bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 font-bold py-2.5 rounded-xl text-sm transition">
                                            🗑 {t('equipment.delete') || 'İlanı Sil'}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex gap-2 mb-2">
                                            <button onClick={() => openChatWithSeller(selectedEquipment)}
                                                className={`flex-1 bg-gradient-to-r ${config.color} text-white font-bold py-2 rounded-xl text-sm hover:opacity-90 transition`}>
                                                💬 {t('equipment.chat_btn') || 'Sohbet Aç'}
                                            </button>
                                            {selectedEquipment.status !== 'SOLD' && (
                                                <button onClick={() => setShowOfferForm(v => !v)}
                                                    className="flex-1 bg-green-600/20 hover:bg-green-600/40 border border-green-500/40 text-green-400 font-bold py-2 rounded-xl text-sm transition">
                                                    {t('equipment.send_offer_btn') || 'Teklif Gönder'}
                                                </button>
                                            )}
                                        </div>

                                        {selectedEquipment.myOffer && (
                                            <div className="bg-gray-900 border border-gray-800 rounded-lg p-2.5 mb-3">
                                                {selectedEquipment.myOffer.status === 'PENDING' && (
                                                    <p className="text-yellow-400 text-xs font-bold">{t('equipment.my_offer_pending_msg', { price: selectedEquipment.myOffer.price })}</p>
                                                )}
                                                {selectedEquipment.myOffer.status === 'COUNTERED' && (
                                                    <>
                                                        <p className="text-purple-300 text-sm font-bold">{t('equipment.my_offer_countered_msg', { price: selectedEquipment.myOffer.counterPrice })}</p>
                                                        <div className="flex gap-1.5 mt-2">
                                                            <button disabled={respondingOfferId === selectedEquipment.myOffer.id}
                                                                onClick={() => respondToMyOfferCounter(selectedEquipment.myOffer.id, 'accept_counter')}
                                                                className="flex-1 bg-green-600/20 hover:bg-green-600/40 border border-green-500/40 text-green-400 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                {t('equipment.accept_counter_btn') || 'Kabul Et'}
                                                            </button>
                                                            <button disabled={respondingOfferId === selectedEquipment.myOffer.id}
                                                                onClick={() => respondToMyOfferCounter(selectedEquipment.myOffer.id, 'reject_counter')}
                                                                className="flex-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 font-bold text-xs py-1.5 rounded-lg transition disabled:opacity-50">
                                                                {t('equipment.reject_counter_btn') || 'Reddet'}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                                {selectedEquipment.myOffer.status === 'ACCEPTED' && (
                                                    <p className="text-green-400 text-xs font-bold">{t('equipment.my_offer_accepted_msg') || 'Teklifiniz kabul edildi!'}</p>
                                                )}
                                                {selectedEquipment.myOffer.status === 'REJECTED' && (
                                                    <p className="text-red-400 text-xs font-bold">{t('equipment.my_offer_rejected_msg') || 'Teklifiniz reddedildi'}</p>
                                                )}
                                            </div>
                                        )}

                                        {showOfferForm && (
                                            <div className="bg-gray-900 border border-gray-800 rounded-lg p-2.5 mb-3 space-y-2">
                                                <input value={offerForm.price} onChange={e => setOfferForm(f => ({ ...f, price: e.target.value.replace(/[^0-9]/g, '') }))}
                                                    placeholder={t('equipment.offer_price_ph') || 'Teklif fiyatı (₺)'} inputMode="numeric"
                                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                                                <input value={offerForm.message} onChange={e => setOfferForm(f => ({ ...f, message: e.target.value }))}
                                                    placeholder={t('equipment.offer_msg_ph') || 'Mesaj (opsiyonel)'}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                                                <button onClick={sendEquipmentOffer} disabled={submittingOffer}
                                                    className={`w-full bg-gradient-to-r ${config.color} text-white font-bold py-2 rounded-lg text-sm hover:opacity-90 transition disabled:opacity-50`}>
                                                    {submittingOffer ? '...' : (t('equipment.offer_send_btn') || 'Teklifi Gönder')}
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Teklif kabul — opsiyon tarihi seçimi */}
                    {acceptDateModal.visible && (
                        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setAcceptDateModal({ visible: false, offerId: null, date: '' })}>
                            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
                                <p className="text-white font-bold text-sm mb-3">{t('equipment.reserve_until_title') || 'Opsiyon tarihi seçin'}</p>
                                <input type="date" value={acceptDateModal.date} min={new Date().toISOString().slice(0, 10)}
                                    onChange={e => setAcceptDateModal(p => ({ ...p, date: e.target.value }))}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-purple-500" />
                                <div className="flex gap-2">
                                    <button onClick={() => setAcceptDateModal({ visible: false, offerId: null, date: '' })}
                                        className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-bold py-2 rounded-xl text-sm transition">
                                        {t('common.cancel') || 'İptal'}
                                    </button>
                                    <button disabled={!acceptDateModal.date}
                                        onClick={() => {
                                            const offerId = acceptDateModal.offerId;
                                            const date = acceptDateModal.date;
                                            setAcceptDateModal({ visible: false, offerId: null, date: '' });
                                            respondEquipmentOffer(offerId, 'accept', new Date(date).toISOString());
                                        }}
                                        className={`flex-1 bg-gradient-to-r ${config.color} text-white font-bold py-2 rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50`}>
                                        {t('equipment.offer_accept') || 'Kabul Et'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TICKETS TAB — Ticketmaster ulusal + uluslararasi mac bileti */}
                    {activeTab === 'tickets' && (
                        <div className="space-y-3">
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    type="text"
                                    value={ticketCity}
                                    onChange={e => setTicketCity(e.target.value)}
                                    placeholder={t('tickets.city_placeholder')}
                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                                />
                                <input
                                    type="date"
                                    value={ticketDateFrom}
                                    onChange={e => setTicketDateFrom(e.target.value)}
                                    className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                                />
                                <input
                                    type="date"
                                    value={ticketDateTo}
                                    onChange={e => setTicketDateTo(e.target.value)}
                                    className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                                />
                                <button
                                    onClick={() => { setTicketsLoaded(false); loadSportsTickets(); }}
                                    className={`bg-gradient-to-r ${config.color} text-white text-sm font-bold rounded-lg px-4 py-2 whitespace-nowrap`}
                                >
                                    {t('tickets.search')}
                                </button>
                            </div>

                            {loadingTickets ? (
                                <p className="text-gray-500 text-sm text-center py-8">{t('common.loading')}</p>
                            ) : sportsTickets.length === 0 ? (
                                ticketsLoaded && <p className="text-gray-600 text-sm text-center py-8">🎟️ {t('tickets.empty')}</p>
                            ) : (
                                <div className="space-y-2.5">
                                    {sportsTickets.map(ev => (
                                        <div key={ev.id} className="flex gap-3 bg-gray-900 border border-gray-800 rounded-xl p-3">
                                            {ev.imageUrl ? (
                                                <img src={ev.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                                            ) : (
                                                <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0 text-2xl">🎟️</div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-white text-sm font-bold line-clamp-2">{ev.name}</p>
                                                <p className="text-gray-500 text-xs mt-0.5 truncate">
                                                    {[ev.venueName, ev.city, ev.country].filter(Boolean).join(' · ')}
                                                </p>
                                                <p className="text-gray-500 text-xs mt-0.5">
                                                    {ev.date}{ev.time ? ` · ${ev.time.slice(0, 5)}` : ''}
                                                </p>
                                                {ev.priceMin != null && (
                                                    <p className="text-purple-300 text-xs font-bold mt-0.5">
                                                        {ev.priceMin}{ev.priceMax && ev.priceMax !== ev.priceMin ? `–${ev.priceMax}` : ''} {ev.currency || ''}
                                                    </p>
                                                )}
                                                {ev.ticketUrl && (
                                                    <a href={ev.ticketUrl} target="_blank" rel="noopener noreferrer"
                                                        className={`inline-block mt-1.5 bg-gradient-to-r ${config.color} text-white text-xs font-bold rounded-lg px-3 py-1.5`}>
                                                        🎟️ {t('tickets.buy')}
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ARCHIVE TAB */}
                    {activeTab === 'archive' && (() => {
                        const now = new Date();
                        const isPast = (m) => m.matchDate ? new Date(m.matchDate) <= now : m.date ? new Date(m.date) <= now : false;
                        const pastNoScore = upcomingMatches.filter(m => isPast(m) && m.matchType !== 'PLAYER_WANTED');
                        const allDone = [
                            ...pastNoScore.map(m => ({ ...m, _kind: 'noScore' })),
                            ...completedMatches.map(m => ({ ...m, _kind: 'pending' })),
                            ...archivedMatches.map(m => ({ ...m, _kind: 'archived' })),
                        ].sort((a, b) => new Date(b.completedAt || b.matchDate || 0) - new Date(a.completedAt || a.matchDate || 0));

                        // Filter helpers
                        const fCity  = archiveFilter.city.trim().toLowerCase();
                        const fCourt = archiveFilter.court.trim().toLowerCase();
                        const fFrom  = archiveFilter.dateFrom ? new Date(archiveFilter.dateFrom) : null;
                        const fTo    = archiveFilter.dateTo   ? new Date(archiveFilter.dateTo + 'T23:59:59') : null;

                        const matchDate = (item) => new Date(item.completedAt || item.matchDate || item.eventDate || 0);

                        const filteredRivals = allDone.filter(m => {
                            if (fCity  && !(m.location || '').toLowerCase().includes(fCity))  return false;
                            if (fCourt && !(m.courtName || '').toLowerCase().includes(fCourt)) return false;
                            if (fFrom  && matchDate(m) < fFrom) return false;
                            if (fTo    && matchDate(m) > fTo)   return false;
                            return true;
                        });

                        const filteredTournaments = archivedTournaments.filter(t => {
                            if (fCity  && !((t.city || '') + ' ' + (t.location || '')).toLowerCase().includes(fCity)) return false;
                            if (fFrom  && matchDate(t) < fFrom) return false;
                            if (fTo    && matchDate(t) > fTo)   return false;
                            return true;
                        });

                        return (
                            <div className="space-y-4">

                                {/* Tab buttons */}
                                <div className="flex gap-2">
                                    <button onClick={() => setArchiveTab('rivals')}
                                        className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition border ${archiveTab === 'rivals' ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'}`}>
                                        ⚔️ {t('archive.find_rival')}
                                    </button>
                                    <button onClick={() => setArchiveTab('tournaments')}
                                        className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition border ${archiveTab === 'tournaments' ? `bg-gradient-to-r ${config.color} text-white border-transparent` : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'}`}>
                                        🏆 {t('archive.tournaments')}
                                    </button>
                                </div>

                                {/* Filters */}
                                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 space-y-2">
                                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide">Filter</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input value={archiveFilter.city} onChange={e => setArchiveFilter(p => ({ ...p, city: e.target.value }))}
                                            placeholder={t('archive.filter_city')} className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500" />
                                        <input value={archiveFilter.court} onChange={e => setArchiveFilter(p => ({ ...p, court: e.target.value }))}
                                            placeholder={t('archive.filter_court')} className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500" />
                                        <input type="date" value={archiveFilter.dateFrom} onChange={e => setArchiveFilter(p => ({ ...p, dateFrom: e.target.value }))}
                                            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500" />
                                        <input type="date" value={archiveFilter.dateTo} onChange={e => setArchiveFilter(p => ({ ...p, dateTo: e.target.value }))}
                                            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500" />
                                    </div>
                                </div>

                                {/* ── Find Rival archive ── */}
                                {archiveTab === 'rivals' && <>
                                {filteredRivals.length === 0
                                    ? <div className="text-center py-12 bg-gray-900 rounded-2xl border border-gray-800"><p className="text-gray-500 text-sm">{t('archive.no_rival_archive')}</p></div>
                                    : <div className="space-y-3">{filteredRivals.map(match => {
                                    const kind = match._kind;
                                    const participants = Array.isArray(match.participants) ? match.participants : [];
                                    const score = match.score;
                                    const dateStr = (match.matchDate || match.completedAt)
                                        ? new Date(match.matchDate || match.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                                        : '—';

                                    if (kind === 'noScore') {
                                        const other = match.senderId === myId ? match.receiver : match.sender;
                                        return (
                                            <div key={match.id} className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 flex items-center justify-between">
                                                <div>
                                                    <p className="text-gray-300 text-sm font-bold">vs @{other?.username || '?'}</p>
                                                    <p className="text-gray-600 text-xs mt-0.5">📅 {dateStr} · No score entered</p>
                                                </div>
                                                <span className="text-gray-600 text-xs bg-gray-800 px-2 py-1 rounded-lg">No Score</span>
                                            </div>
                                        );
                                    }

                                    if (kind === 'pending') {
                                        const other = match.senderId === myId ? match.receiver : match.sender;
                                        const senderTeamArr = Array.isArray(match.senderTeam) ? match.senderTeam : [];
                                        const iAmTeamA = match.senderId === myId || senderTeamArr.some(m => m.id === myId);
                                        const iAmTeamB = participants.some(p => p.id === myId);
                                        const isInvolved = iAmTeamA || iAmTeamB;
                                        const teamA_ids = new Set([match.senderId, ...senderTeamArr.map(m => m.id)]);
                                        const scorerIsTeamA = teamA_ids.has(match.scoreEnteredBy);
                                        const mySideScored = (iAmTeamA && scorerIsTeamA) || (iAmTeamB && !scorerIsTeamA);
                                        const canConfirm = score && match.scoreStatus === 'PENDING' && isInvolved && !mySideScored;
                                        const isDisputed = match.scoreStatus === 'DISPUTED';
                                        return (
                                            <div key={match.id} className={`rounded-2xl p-4 border ${isDisputed ? 'bg-red-500/5 border-red-500/30' : 'bg-yellow-500/5 border-yellow-500/20'}`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-gray-300 text-sm font-bold">vs @{other?.username || '?'}</span>
                                                    {isDisputed
                                                        ? <span className="text-red-400 text-xs font-bold bg-red-500/10 px-2 py-0.5 rounded-full">⚠️ Disputed</span>
                                                        : <span className="text-yellow-400 text-xs font-bold bg-yellow-500/10 px-2 py-0.5 rounded-full">⏳ Awaiting confirmation</span>
                                                    }
                                                </div>
                                                <p className="text-gray-600 text-xs mb-3">📅 {dateStr}</p>
                                                {score && <ScoreDisplay score={score} match={match} participants={participants} config={config} />}
                                                <div className="mt-3 space-y-2">
                                                    {canConfirm && (
                                                        <div className="flex gap-2">
                                                            <button onClick={async () => {
                                                                const { data } = await api.patch(`/rivals/${match.id}/confirm-score`);
                                                                setCompletedMatches(prev => prev.filter(m => m.id !== match.id));
                                                                setArchivedMatches(prev => [data, ...prev]);
                                                            }} className="flex-1 bg-green-600/80 hover:bg-green-600 text-white font-bold py-2 rounded-xl text-sm transition">✓ Confirm Score</button>
                                                            <button onClick={async () => {
                                                                await api.patch(`/rivals/${match.id}/dispute-score`);
                                                                setCompletedMatches(prev => prev.map(m => m.id === match.id ? { ...m, scoreStatus: 'DISPUTED' } : m));
                                                            }} className="flex-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 font-bold py-2 rounded-xl text-sm transition">✕ Dispute</button>
                                                        </div>
                                                    )}
                                                    {score && match.scoreStatus === 'PENDING' && mySideScored && (
                                                        <div className="flex-1 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-bold py-2 rounded-xl text-center">⏳ Waiting for opponent to confirm</div>
                                                    )}
                                                    {isDisputed && isInvolved && (
                                                        <button onClick={async () => {
                                                            await api.post(`/rivals/${match.id}/report-dispute`, { reason: 'Score disagreement' });
                                                            alert('📋 Report filed. An admin will review.');
                                                        }} className="w-full bg-red-600/10 border border-red-500/30 text-red-400 font-bold py-2 rounded-xl text-sm hover:bg-red-600/20 transition">📋 Report to Admin</button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }

                                    if (kind === 'archived' && score) {
                                        const isWin = match.senderId === myId ? score.winner === 'sender' : score.winner !== 'sender' && score.winner !== 'draw';
                                        const isDraw = score.winner === 'draw';
                                        const ratingSnapshot = score.ratingSnapshot || {};
                                        const ratingEntries = Object.entries(ratingSnapshot);
                                        const senderTeamArr = Array.isArray(match.senderTeam) ? match.senderTeam : [];
                                        const rosterIds = [match.senderId, ...participants.map(p => p.id), ...senderTeamArr.map(m => m.id)];
                                        const eligibleForPeerReview = match.subCategory === 'volleyball' && match.matchMode === 'COMPETITIVE' && rosterIds.includes(myId);
                                        return (
                                            <div key={match.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                                                    <div>
                                                        <p className="text-gray-400 text-xs">
                                                            {match.matchType === 'DOUBLE' ? '2v2' : '1v1'}
                                                            {match.matchMode === 'COMPETITIVE' && <span className="ml-1 text-red-400">⚔️ Ranked</span>}
                                                            {' · '}{dateStr}
                                                            {match.matchTime && ` · ${match.matchTime}`}
                                                        </p>
                                                        {(match.location || match.courtName) && (
                                                            <p className="text-gray-600 text-[10px] mt-0.5">📍 {[match.courtName, match.location].filter(Boolean).join(' · ')}</p>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs font-black px-2 py-0.5 rounded-full ${isDraw ? 'bg-yellow-500/20 text-yellow-400' : isWin ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                        {isDraw ? '🤝 Draw' : isWin ? '🏆 Win' : '❌ Loss'}
                                                    </span>
                                                </div>
                                                <ScoreDisplay score={score} match={match} participants={participants} config={config} />
                                                {ratingEntries.length > 0 && (
                                                    <div className="px-4 py-2 border-t border-gray-800 flex flex-wrap gap-4">
                                                        {ratingEntries.map(([uid, snap]) => (
                                                            <div key={uid} className="flex items-center gap-1.5">
                                                                <span className="text-gray-500 text-xs">{snap.username}</span>
                                                                <span className="text-gray-400 text-xs font-mono">{Number(snap.skillRating_before).toFixed(2)}★</span>
                                                                {snap.change !== 0 && (
                                                                    <>
                                                                        <span className="text-gray-600 text-xs">→</span>
                                                                        <span className={`text-xs font-bold ${snap.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                            {Number(snap.skillRating_after).toFixed(2)}★
                                                                            <span className="ml-0.5 opacity-70">({snap.change > 0 ? '+' : ''}{snap.change}pts)</span>
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {eligibleForPeerReview && (
                                                    <div className="px-4 py-2 border-t border-gray-800">
                                                        <button onClick={() => setPeerReviewRivalId(match.id)}
                                                            className="text-purple-400 hover:text-purple-300 text-xs font-bold transition">
                                                            ⭐ {t('peerReview.rate_teammates')}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }
                                    return null;
                                })}</div>
                                }
                                </>}

                                {/* ── Tournaments archive ── */}
                                {archiveTab === 'tournaments' && <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                                    <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                                        <span className="text-base">🏆</span>
                                        <h3 className="text-white font-bold text-sm flex-1">{t('tournament.title')}</h3>
                                        <span className="text-gray-600 text-xs">{filteredTournaments.length}</span>
                                    </div>
                                    {filteredTournaments.length === 0
                                        ? <p className="text-gray-500 text-sm text-center py-8">{t('archive.no_tournament_archive')}</p>
                                        : <div className="divide-y divide-gray-800">{filteredTournaments.map(t => {
                                            if (t.type === '1' || t.type === '2' || t.type === '3' || t.type === '4') return (
                                                <button key={t.id} onClick={() => openMatchesModal(t)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition text-left">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white font-bold text-sm truncate">{t.name}</p>
                                                        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                                            <span className="text-gray-500 text-xs">{TYPE_LABEL[t.type]}</span>
                                                            {t.completedAt && <span className="text-gray-600 text-xs">{new Date(t.completedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                                                            {(t.city || t.location) && <span className="text-gray-600 text-xs">📍 {(t.city || t.location).split(',')[0]}</span>}
                                                        </div>
                                                    </div>
                                                    <span className="text-gray-400 text-xl flex-shrink-0">›</span>
                                                </button>
                                            );
                                            const bracket   = t.bracketData;
                                            const teams     = bracket?.teams || [];
                                            const teamFull  = (team) => team ? `${team.p1?.firstName || ''} ${team.p1?.lastName || ''} & ${team.p2?.firstName || ''} ${team.p2?.lastName || ''}` : '?';
                                            const winTeam   = teams.find(tm => tm.id === bracket?.final?.winner);
                                            const isOpen    = expandedArchiveTIds.has(t.id);
                                            const toggleOpen = () => setExpandedArchiveTIds(prev => {
                                                const next = new Set(prev);
                                                next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                                                return next;
                                            });

                                            const matchesByRound = {};
                                            (bracket?.matches || []).forEach(m => {
                                                if (!matchesByRound[m.round]) matchesByRound[m.round] = [];
                                                matchesByRound[m.round].push(m);
                                            });
                                            const rounds   = Object.keys(matchesByRound).map(Number).sort((a, b) => a - b);
                                            const maxRound = rounds.length > 0 ? Math.max(...rounds) : 0;
                                            const roundLabel = (rnd) => rnd === maxRound ? 'Semifinal' : rnd === maxRound - 1 && maxRound > 2 ? 'Quarterfinal' : `Round ${rnd}`;

                                            // Standings: 3pts per win, 0 per loss
                                            const st = {};
                                            teams.forEach(tm => { st[tm.id] = { team: tm, mw: 0, ml: 0, sw: 0, sl: 0, roundOut: 0 }; });
                                            const applyMatch = (m, rnd) => {
                                                if (!m.played) return;
                                                const sets = m.sets || [];
                                                const t1s  = sets.filter(s => (parseInt(s.t1)||0) > (parseInt(s.t2)||0)).length;
                                                const t2s  = sets.filter(s => (parseInt(s.t2)||0) > (parseInt(s.t1)||0)).length;
                                                const w    = t1s > t2s ? m.t1 : t2s > t1s ? m.t2 : m.winner;
                                                if (st[m.t1]) { w === m.t1 ? st[m.t1].mw++ : st[m.t1].ml++; st[m.t1].sw += t1s; st[m.t1].sl += t2s; st[m.t1].roundOut = Math.max(st[m.t1].roundOut, rnd); }
                                                if (st[m.t2]) { w === m.t2 ? st[m.t2].mw++ : st[m.t2].ml++; st[m.t2].sw += t2s; st[m.t2].sl += t1s; st[m.t2].roundOut = Math.max(st[m.t2].roundOut, rnd); }
                                            };
                                            (bracket?.matches || []).forEach(m => applyMatch(m, m.round));
                                            if (bracket?.final?.played) applyMatch(bracket.final, maxRound + 1);
                                            const sorted = Object.values(st)
                                                .map(r => ({ ...r, tPts: r.mw * 3 }))
                                                .sort((a, b) => b.tPts !== a.tPts ? b.tPts - a.tPts : b.sw - a.sw);

                                            return (
                                                <div key={t.id}>
                                                    {/* Header row */}
                                                    <button onClick={toggleOpen} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition text-left">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-white font-bold text-sm truncate">{t.name}</p>
                                                            <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                                                {winTeam && <span className="text-yellow-400 text-xs font-bold">🏆 {teamFull(winTeam)}</span>}
                                                                {t.completedAt && <span className="text-gray-600 text-xs">{new Date(t.completedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                                                                {(t.city || t.location) && <span className="text-gray-600 text-xs">📍 {(t.city || t.location).split(',')[0]}</span>}
                                                            </div>
                                                        </div>
                                                        <span className={`text-gray-400 text-xl flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
                                                    </button>

                                                    {/* Expanded */}
                                                    {isOpen && (
                                                        <div className="border-t border-gray-800 bg-gray-800/20 divide-y divide-gray-800">

                                                            {/* Final */}
                                                            {bracket?.final?.played && (() => {
                                                                const f    = bracket.final;
                                                                const sets = f.sets || [];
                                                                const tA   = teams.find(x => x.id === f.t1);
                                                                const tB   = teams.find(x => x.id === f.t2);
                                                                const t1w  = sets.filter(s => (parseInt(s.t1)||0) > (parseInt(s.t2)||0)).length;
                                                                const t2w  = sets.filter(s => (parseInt(s.t2)||0) > (parseInt(s.t1)||0)).length;
                                                                return (
                                                                    <div className="px-4 py-3 bg-yellow-500/5">
                                                                        <p className="text-yellow-500 text-[10px] font-bold uppercase tracking-widest mb-2">🏆 Final</p>
                                                                        <div className="flex items-center gap-3 text-sm">
                                                                            <span className={`flex-1 font-bold truncate ${f.winner === f.t1 ? 'text-yellow-400' : 'text-gray-500'}`}>{teamFull(tA)}</span>
                                                                            <div className="flex-shrink-0 text-center">
                                                                                <div className="flex gap-1">{sets.map((s, i) => <span key={i} className="bg-gray-800 rounded px-1.5 py-0.5 text-xs font-mono text-gray-300">{s.t1||0}–{s.t2||0}</span>)}</div>
                                                                                <p className="text-gray-600 text-[10px] mt-0.5">{t1w}–{t2w} sets</p>
                                                                            </div>
                                                                            <span className={`flex-1 font-bold truncate text-right ${f.winner === f.t2 ? 'text-yellow-400' : 'text-gray-500'}`}>{teamFull(tB)}</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}

                                                            {/* Standings */}
                                                            {sorted.length > 0 && (
                                                                <div className="px-4 py-3">
                                                                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">📊 Standings</p>
                                                                    <div className="flex gap-2 text-gray-600 text-[10px] font-bold uppercase mb-1 px-1">
                                                                        <span className="w-5">#</span>
                                                                        <span className="flex-1">Team</span>
                                                                        <span className="w-6 text-center">W</span>
                                                                        <span className="w-6 text-center">L</span>
                                                                        <span className="w-8 text-center">SW</span>
                                                                        <span className="w-8 text-center">SL</span>
                                                                        <span className="w-10 text-right text-purple-500">Pts</span>
                                                                    </div>
                                                                    {sorted.map((row, idx) => {
                                                                        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx <= 3 ? '🥉' : `${idx + 1}.`;
                                                                        return (
                                                                            <div key={row.team.id} className={`flex gap-2 items-center rounded-xl px-2 py-1.5 mb-0.5 text-xs ${idx === 0 ? 'bg-yellow-500/10' : 'hover:bg-gray-800/40'}`}>
                                                                                <span className="w-5 text-center text-sm">{medal}</span>
                                                                                <span className={`flex-1 font-bold truncate ${idx === 0 ? 'text-yellow-400' : 'text-gray-300'}`}>
                                                                                    {row.team.p1?.firstName} & {row.team.p2?.firstName}
                                                                                </span>
                                                                                <span className="w-6 text-center text-green-400 font-bold">{row.mw}</span>
                                                                                <span className="w-6 text-center text-red-400">{row.ml}</span>
                                                                                <span className="w-8 text-center text-gray-400">{row.sw}</span>
                                                                                <span className="w-8 text-center text-gray-600">{row.sl}</span>
                                                                                <span className={`w-10 text-right font-black ${idx === 0 ? 'text-yellow-400' : 'text-purple-400'}`}>{row.tPts}</span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}

                                                            {/* Match results by round */}
                                                            {rounds.length > 0 && (
                                                                <div className="px-4 py-3 space-y-3">
                                                                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Match Results</p>
                                                                    {rounds.map(rnd => (
                                                                        <div key={rnd}>
                                                                            <p className="text-gray-600 text-[10px] font-bold mb-1.5 uppercase tracking-wide">{roundLabel(rnd)}</p>
                                                                            <div className="space-y-1">
                                                                                {matchesByRound[rnd].map(m => {
                                                                                    const tA   = teams.find(x => x.id === m.t1);
                                                                                    const tB   = teams.find(x => x.id === m.t2);
                                                                                    const sets = m.sets || [];
                                                                                    const t1w  = sets.filter(s => (parseInt(s.t1)||0) > (parseInt(s.t2)||0)).length;
                                                                                    const t2w  = sets.filter(s => (parseInt(s.t2)||0) > (parseInt(s.t1)||0)).length;
                                                                                    const w    = t1w > t2w ? m.t1 : t2w > t1w ? m.t2 : m.winner;
                                                                                    return (
                                                                                        <div key={m.id} className="flex items-center gap-2 bg-gray-800/40 rounded-xl px-3 py-2 text-xs">
                                                                                            <span className={`flex-1 truncate ${w === m.t1 ? 'text-white font-bold' : 'text-gray-500'}`}>{tA?.p1?.firstName}/{tA?.p2?.firstName}</span>
                                                                                            <div className="flex gap-1 flex-shrink-0">{sets.map((s, i) => <span key={i} className="font-mono text-gray-400">{s.t1||0}–{s.t2||0}</span>)}</div>
                                                                                            <span className={`flex-1 truncate text-right ${w === m.t2 ? 'text-white font-bold' : 'text-gray-500'}`}>{tB?.p1?.firstName}/{tB?.p2?.firstName}</span>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}</div>
                                    }
                                </div>}

                            </div>
                        );
                    })()}
                </div>

                {/* SAĞ PANEL - %25 */}
                <div className="hidden lg:block lg:w-[25%] shrink-0 space-y-4">

                    {/* Yazı Post Oluştur */}
                    <form onSubmit={handleTextPost} className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                        <h4 className="text-white font-bold mb-3">✍️ {t('community.share_thoughts')}</h4>
                        <textarea
                            value={newTextPost}
                            onChange={e => setNewTextPost(e.target.value)}
                            placeholder={isWellness ? `Share your ${config.name} experience... ${config.emoji}` : `What's on your mind? ${config.emoji}`}
                            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 resize-none text-sm"
                            rows={3}
                        />
                        <div className="flex justify-end mt-2">
                            <button
                                type="submit"
                                disabled={isPosting || !newTextPost.trim()}
                                className={`bg-gradient-to-r ${config.color} text-white font-bold px-4 py-1.5 rounded-full text-sm transition disabled:opacity-50`}
                            >
                                {isPosting ? '...' : t('community.post')}
                            </button>
                        </div>
                    </form>

                    {/* Community Posts */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="text-white font-bold text-sm">💬 {t('community.community_posts')}</h4>
                            {posts.length > 3 && (
                                <button
                                    onClick={() => setShowPostsOverlay(true)}
                                    className="text-purple-400 hover:text-purple-300 text-xs transition"
                                >
                                    {t('community.see_all', { n: posts.length })}
                                </button>
                            )}
                        </div>
                        {posts.length === 0 ? (
                            <div className="text-center py-6 bg-gray-900 rounded-2xl border border-gray-800">
                                <p className="text-gray-500 text-sm">{t('community.no_posts')}</p>
                            </div>
                        ) : (
                            posts.slice(0, 3).map(post => (
                                <div key={post.id} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                                    <div className="p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className={`w-7 h-7 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                                {post.user?.username?.[0]?.toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-xs font-bold truncate">{post.user?.fullName}</p>
                                                <p className="text-gray-500 text-xs">@{post.user?.username}</p>
                                            </div>
                                            <p className="text-gray-600 text-xs flex-shrink-0">
                                                {new Date(post.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <p className="text-gray-200 text-sm mb-2 line-clamp-3">{post.content}</p>
                                        <div className="flex gap-3 text-gray-400 text-xs">
                                            <button
                                                onClick={() => handleLike(post.id)}
                                                className={`hover:text-red-400 transition ${post.isLiked ? 'text-red-400' : ''}`}
                                            >
                                                {post.isLiked ? '❤️' : '🤍'} {post._count?.likes || 0}
                                            </button>
                                            <button
                                                onClick={() => handleExpandPost(post.id)}
                                                className={`hover:text-purple-400 transition flex items-center gap-1 ${expandedPostId === post.id ? 'text-purple-400' : ''}`}
                                            >
                                                💬 {post._count?.comments || 0} {expandedPostId === post.id ? '▲' : '▼'}
                                            </button>
                                        </div>
                                    </div>
                                    {expandedPostId === post.id && (
                                        <div className="border-t border-gray-800 bg-gray-950 p-3 space-y-3">
                                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                                {!comments[post.id] ? (
                                                    <p className="text-gray-500 text-xs text-center py-2">{t('common.loading')}</p>
                                                ) : comments[post.id].length === 0 ? (
                                                    <p className="text-gray-500 text-xs text-center py-2">{t('community.no_comments')}</p>
                                                ) : (
                                                    comments[post.id].map(c => (
                                                        <div key={c.id} className="flex gap-2">
                                                            <div className={`w-6 h-6 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                                                {c.user?.username?.[0]?.toUpperCase()}
                                                            </div>
                                                            <div className="bg-gray-800 rounded-xl px-3 py-1.5 flex-1">
                                                                <p className="text-white text-xs font-bold">@{c.user?.username}</p>
                                                                <p className="text-gray-300 text-xs mt-0.5">{c.content}</p>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    value={newComment}
                                                    onChange={e => setNewComment(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleAddComment(post.id)}
                                                    placeholder="Write a comment..."
                                                    className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-1.5 text-xs border border-gray-700 focus:outline-none focus:border-purple-500"
                                                />
                                                <button
                                                    onClick={() => handleAddComment(post.id)}
                                                    className={`bg-gradient-to-r ${config.color} text-white font-bold px-3 py-1.5 rounded-xl text-xs`}
                                                >
                                                    Send
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                </div>
            </div>

            {/* Overlays */}
            {showPostsOverlay && (
                <PostsOverlay
                    posts={posts}
                    config={config}
                    onClose={() => setShowPostsOverlay(false)}
                />
            )}
            {showNewsOverlay && (
                <NewsOverlay
                    news={news}
                    config={config}
                    onClose={() => setShowNewsOverlay(false)}
                />
            )}
            {viewingContent && (
                <ContentViewer post={viewingContent} onClose={() => setViewingContent(null)} />
            )}
            {scoringMatch && (
                <ScoreModal
                    match={scoringMatch}
                    config={config}
                    myId={myId}
                    onClose={() => setScoringMatch(null)}
                    onSave={(updated) => {
                        setUpcomingMatches(prev => prev.filter(m => m.id !== updated.id));
                        setCompletedMatches(prev => {
                            const exists = prev.some(m => m.id === updated.id);
                            return exists ? prev.map(m => m.id === updated.id ? updated : m) : [updated, ...prev];
                        });
                        setScoringMatch(null);
                    }}
                />
            )}
            {teamChallengeRival && (
                <TeamChallengeModal
                    config={config}
                    sub={sub}
                    categoryUpper={categoryUpper}
                    rival={teamChallengeRival}
                    myId={myId}
                    myInterest={myInterest}
                    onClose={() => setTeamChallengeRival(null)}
                    onSent={() => {
                        setRivals(prev => prev.map(r =>
                            r.id === teamChallengeRival.id ? { ...r, _mySentRequest: true } : r
                        ));
                        setTeamChallengeRival(null);
                    }}
                />
            )}

            {joinInvitePicker && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm max-h-[70vh] flex flex-col">
                        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-800">
                            <h4 className="text-white font-bold text-sm">👥 Invite a Partner</h4>
                            <button onClick={() => setJoinInvitePicker(null)} className="text-gray-400 hover:text-white text-lg">✕</button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 py-3">
                            {joinInvitePicker.candidates.length === 0 ? (
                                <p className="text-gray-500 text-sm text-center py-6">No other solo applicants to invite yet</p>
                            ) : joinInvitePicker.candidates.map(c => (
                                <button key={c.userId}
                                    onClick={() => setMyRivalJoinPartner(joinInvitePicker.rivalId, c.userId)}
                                    disabled={partnerActionLoading}
                                    className="w-full flex items-center gap-3 py-2.5 border-b border-gray-800 hover:bg-gray-800/60 transition text-left">
                                    <div className={`w-9 h-9 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                        {c.user?.username?.[0]?.toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-white text-sm font-bold truncate">{c.user?.fullName || c.user?.username}</p>
                                        <p className="text-gray-500 text-xs truncate">
                                            @{c.user?.username}{(c.user?.interests || []).find(i => i.subCategory === sub)?.skillRating != null
                                                ? `  ${Number((c.user.interests.find(i => i.subCategory === sub)).skillRating).toFixed(2)}★` : ''}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {matchesModalTournament && (() => {
                const mt = matchesModalTournament;
                const matches = tournMatchesData.matches || [];
                const groupMatches   = matches.filter(m => m.phase === 'GROUP');
                const playoffMatches = matches.filter(m => m.phase === 'PLAYOFF');
                const standings = computeTournamentStandings(matches);
                const isCreator = mt.creatorId === myId;

                const sideId = () => (mt.type === '2' || mt.type === '4') ? tournMatchesData.myTeamId : myId;
                const myMatchSide = (m) => {
                    const sid = sideId();
                    if (!sid) return null;
                    if (m.p1Id === sid) return 'p1';
                    if (m.p2Id === sid) return 'p2';
                    return null;
                };

                const closeModal = () => { setMatchesModalTournament(null); setScoreEntryMatchId(null); };

                const ratingOf = (uid) => tournMatchesData.playerRatings?.[uid];
                const fmtR = (r) => r != null ? `${Number(r).toFixed(2)}★` : '—';
                const teamById = (tid) => (tournMatchesData.teams || []).find(t => t.id === tid);

                // Çiftler Rekabetçi: her iki oyuncunun güncel bireysel puanı + takım ortalaması,
                // alt alta (truncate olmadan, hepsi sığsın diye). Bireysel Rekabetçi: tek satır.
                // Maç tamamlandıysa (skor girildiyse), her oyuncu ve takım ortalaması için
                // "eski puan → yeni puan" gösterilir; tamamlanmadıysa sadece güncel puan.
                const SideBlock = ({ m, side }) => {
                    const sid = m[`${side}Id`];
                    const name = m[`${side}Name`];
                    const isDone = m.status === 'COMPLETED';
                    const memberRatings = m.score?.[`${side}MemberRatings`] || [];
                    const memberFor = (uid) => memberRatings.find(mr => mr.userId === uid);
                    const teamBefore = m.score?.[`${side}RatingBefore`];
                    const teamAfter  = m.score?.[`${side}RatingAfter`];

                    const playerDisplay = (uid) => {
                        const mr = memberFor(uid);
                        return (isDone && mr) ? `${fmtR(mr.before)} → ${fmtR(mr.after)}` : fmtR(ratingOf(uid));
                    };

                    if (mt.type === '2' || mt.type === '4') {
                        const team = teamById(sid);
                        if (!team) return <p className="text-white text-sm font-bold">{name || 'TBD'}</p>;
                        const avgDisplay = (isDone && teamBefore != null && teamAfter != null)
                            ? `${fmtR(teamBefore)} → ${fmtR(teamAfter)}`
                            : fmtR(team.avgRating);
                        return (
                            <div className="text-sm">
                                <p className="text-white font-bold leading-tight">
                                    {team.player1Name} <span className="text-gray-400 text-[11px] font-normal">({playerDisplay(team.player1Id)})</span>
                                </p>
                                <p className="text-white font-bold leading-tight">
                                    {team.player2Name} <span className="text-gray-400 text-[11px] font-normal">({playerDisplay(team.player2Id)})</span>
                                </p>
                                <p className="text-purple-300 text-[11px] font-bold mt-0.5">Takım Ort: {avgDisplay}</p>
                            </div>
                        );
                    }
                    return (
                        <p className="text-white text-sm font-bold truncate">
                            {name || 'TBD'} <span className="text-gray-400 text-[11px] font-normal">({playerDisplay(sid)})</span>
                        </p>
                    );
                };

                const MatchCard = ({ m }) => {
                    const mySide = myMatchSide(m);
                    const otherSide = mySide === 'p1' ? 'p2' : mySide === 'p2' ? 'p1' : null;
                    const canScore = isCreator || mySide != null;
                    const editing = scoreEntryMatchId === m.id;
                    const sc = m.score || {};
                    return (
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    {(mt.type === '2' || mt.type === '4') ? (
                                        <div className="space-y-1.5">
                                            <SideBlock m={m} side="p1" />
                                            <p className="text-gray-500 text-[10px] font-black">vs</p>
                                            <SideBlock m={m} side="p2" />
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 min-w-0">
                                            <SideBlock m={m} side="p1" />
                                            <span className="text-gray-500 text-sm flex-shrink-0">vs</span>
                                            <SideBlock m={m} side="p2" />
                                        </div>
                                    )}
                                    {m.status === 'COMPLETED' && (
                                        <p className="text-green-400 text-xs mt-0.5">
                                            {(sc.sets || []).map((s, i) => `${s.p1}-${s.p2}`).join(', ')} · {m.winnerId === m.p1Id ? m.p1Name : m.p2Name} won
                                        </p>
                                    )}
                                    {m.status === 'BYE' && <p className="text-gray-500 text-xs mt-0.5">BYE</p>}
                                    {m.status === 'PENDING' && m.deadline && (
                                        <p className="text-gray-500 text-[11px] mt-0.5">⏰ {new Date(m.deadline).toLocaleDateString('tr-TR')}</p>
                                    )}
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${m.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' : m.status === 'BYE' ? 'bg-gray-700 text-gray-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                                    {m.status}
                                </span>
                            </div>

                            {m.status === 'PENDING' && canScore && !editing && (
                                <div className="flex items-center gap-2">
                                    <button onClick={() => openScoreEntry(m)}
                                        className={`flex-1 bg-gradient-to-r ${config.color} text-white text-xs font-bold py-1.5 rounded-lg`}>
                                        📝 Enter Score
                                    </button>
                                    {mySide && !mt.dayTrip && !m[`${mySide}JokerRequested`] && (
                                        <button onClick={() => submitJoker(mt.id, m.id)} disabled={matchActionLoading}
                                            className="bg-purple-600/20 border border-purple-500/40 text-purple-300 text-xs font-bold px-3 py-1.5 rounded-lg">
                                            🃏{m[`${otherSide}JokerRequested`] ? ' Mutual' : ' Joker'}
                                        </button>
                                    )}
                                </div>
                            )}
                            {m.status === 'COMPLETED' && isCreator && !editing && (
                                <button onClick={() => openScoreEntry(m)} className="text-purple-400 text-[11px] font-bold">✏️ Correct score</button>
                            )}

                            {editing && (
                                <div className="bg-gray-950 border border-gray-700 rounded-lg p-2.5 space-y-2">
                                    {scoreSets.map((s, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <span className="text-gray-500 text-[10px] w-10">Set {i + 1}</span>
                                            <input type="number" min="0" value={s.p1} onChange={e => setScoreSets(prev => prev.map((x, idx) => idx === i ? { ...x, p1: e.target.value } : x))}
                                                className="w-12 bg-gray-800 border border-gray-700 rounded text-white text-center text-sm py-1" />
                                            <span className="text-gray-600 text-xs">-</span>
                                            <input type="number" min="0" value={s.p2} onChange={e => setScoreSets(prev => prev.map((x, idx) => idx === i ? { ...x, p2: e.target.value } : x))}
                                                className="w-12 bg-gray-800 border border-gray-700 rounded text-white text-center text-sm py-1" />
                                            {scoreSets.length > 1 && (
                                                <button onClick={() => setScoreSets(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500 text-xs">✕</button>
                                            )}
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setScoreSets(prev => [...prev, { p1: '', p2: '' }])} className="text-purple-400 text-[11px] font-bold">+ Add set</button>
                                        <div className="flex-1" />
                                        <button onClick={() => setScoreEntryMatchId(null)} className="text-gray-400 text-xs font-bold px-2">Cancel</button>
                                        <button onClick={() => submitMatchScore(mt.id, m)} disabled={matchActionLoading}
                                            className={`bg-gradient-to-r ${config.color} text-white text-xs font-bold px-3 py-1.5 rounded-lg`}>
                                            Save
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                };

                const roundsOf = (list) => [...new Set(list.map(m => m.round))].sort((a, b) => a - b);

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
                        onClick={closeModal}>
                        <div className="bg-gray-950 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col"
                            onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between p-4 border-b border-gray-800 flex-shrink-0">
                                <div className="min-w-0">
                                    <p className="text-white font-bold text-sm truncate">{mt.name}</p>
                                    <p className="text-gray-500 text-[11px]">{TYPE_LABEL[mt.type]}</p>
                                </div>
                                <button onClick={closeModal} className="text-gray-500 hover:text-white text-lg flex-shrink-0">✕</button>
                            </div>
                            <div className="flex border-b border-gray-800 flex-shrink-0">
                                {['matches', 'standings', 'chat'].map(tb => (
                                    <button key={tb} onClick={() => setMatchTab(tb)}
                                        className={`flex-1 py-2.5 text-xs font-bold transition ${matchTab === tb ? 'text-white border-b-2 border-purple-500' : 'text-gray-500 hover:text-gray-300'}`}>
                                        {tb === 'matches' ? `📅 ${t('tournament.title')}` : tb === 'standings' ? '📊 Standings' : '💬 Chat'}
                                    </button>
                                ))}
                            </div>
                            {isCreator && mt.status === 'IN_PROGRESS' && matchTab === 'matches' && (
                                <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 flex-shrink-0">
                                    <button onClick={() => submitRegenRound(mt.id)} disabled={matchActionLoading}
                                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-bold py-1.5 rounded-lg transition">
                                        🔁 Regenerate Round
                                    </button>
                                    <button onClick={() => submitRematch(mt)} disabled={matchActionLoading}
                                        className="flex-1 bg-orange-600/20 border border-orange-500/40 text-orange-300 text-[11px] font-bold py-1.5 rounded-lg transition">
                                        ♻️ Rematch
                                    </button>
                                </div>
                            )}
                            <div className="overflow-y-auto p-4 space-y-4 flex-1">
                                {matchTab === 'matches' ? (
                                    matches.length === 0 ? (
                                        <p className="text-gray-500 text-sm text-center py-8">No matches yet.</p>
                                    ) : (
                                        <>
                                            {roundsOf(groupMatches).map(r => (
                                                <div key={`g${r}`}>
                                                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide mb-2">Round {r}</p>
                                                    <div className="space-y-2">
                                                        {groupMatches.filter(m => m.round === r).map(m => <MatchCard key={m.id} m={m} />)}
                                                    </div>
                                                </div>
                                            ))}
                                            {roundsOf(playoffMatches).map(r => (
                                                <div key={`p${r}`}>
                                                    <p className="text-purple-400 text-[10px] font-bold uppercase tracking-wide mb-2">Playoff — Round {r}</p>
                                                    <div className="space-y-2">
                                                        {playoffMatches.filter(m => m.round === r).map(m => <MatchCard key={m.id} m={m} />)}
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )
                                ) : matchTab === 'standings' ? (
                                    standings.length === 0 ? (
                                        <p className="text-gray-500 text-sm text-center py-8">No completed group matches yet.</p>
                                    ) : (
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="text-gray-500 text-left border-b border-gray-800">
                                                    <th className="py-2 pr-2">#</th>
                                                    <th className="py-2 pr-2">Player/Team</th>
                                                    <th className="py-2 px-1 text-center">P</th>
                                                    <th className="py-2 px-1 text-center">W</th>
                                                    <th className="py-2 px-1 text-center">L</th>
                                                    <th className="py-2 px-1 text-center">±Set</th>
                                                    <th className="py-2 pl-1 text-center">Pts</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {standings.map((s, i) => (
                                                    <tr key={s.id} className="text-gray-300 border-b border-gray-900">
                                                        <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                                                        <td className="py-1.5 pr-2 truncate max-w-[140px]">{s.name}</td>
                                                        <td className="py-1.5 px-1 text-center">{s.played}</td>
                                                        <td className="py-1.5 px-1 text-center text-green-400">{s.won}</td>
                                                        <td className="py-1.5 px-1 text-center text-red-400">{s.lost}</td>
                                                        <td className="py-1.5 px-1 text-center">{s.setsW - s.setsL > 0 ? '+' : ''}{s.setsW - s.setsL}</td>
                                                        <td className="py-1.5 pl-1 text-center font-bold text-white">{s.pts}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )
                                ) : (
                                    <div className="flex flex-col h-full">
                                        <div className="flex-1 space-y-3 mb-3">
                                            {tournChatMessages.length === 0 ? (
                                                <p className="text-gray-500 text-sm text-center py-8">No messages yet.</p>
                                            ) : tournChatMessages.map(msg => (
                                                <div key={msg.id} className={`flex ${msg.senderId === myId ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[75%] rounded-xl px-3 py-2 ${msg.senderId === myId ? `bg-gradient-to-r ${config.color} text-white` : 'bg-gray-800 text-gray-200'}`}>
                                                        {msg.senderId !== myId && (
                                                            <p className="text-[10px] font-bold opacity-70 mb-0.5">{msg.sender?.fullName || msg.sender?.username}</p>
                                                        )}
                                                        <p className="text-xs">{msg.content}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {matchTab === 'chat' && (
                                <div className="flex items-center gap-2 p-3 border-t border-gray-800 flex-shrink-0">
                                    <input value={tournChatInput} onChange={e => setTournChatInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && sendTournChat(mt.id)}
                                        placeholder="Type a message..."
                                        className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                                    <button onClick={() => sendTournChat(mt.id)}
                                        className={`bg-gradient-to-r ${config.color} text-white font-bold px-4 py-2 rounded-xl text-sm`}>
                                        Send
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

            {tournInvitePicker && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm max-h-[70vh] flex flex-col">
                        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-800">
                            <h4 className="text-white font-bold text-sm">👥 {t('tournament.invite_partner')}</h4>
                            <button onClick={() => setTournInvitePicker(null)} className="text-gray-400 hover:text-white text-lg">✕</button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 py-3">
                            {tournInvitePicker.candidates.length === 0 ? (
                                <p className="text-gray-500 text-sm text-center py-6">No other solo applicants to invite yet</p>
                            ) : tournInvitePicker.candidates.map(c => (
                                <button key={c.userId}
                                    onClick={() => setMyTournamentPartner(tournInvitePicker.tournamentId, c.userId)}
                                    disabled={tournPartnerLoading}
                                    className="w-full flex items-center gap-3 py-2.5 border-b border-gray-800 hover:bg-gray-800/60 transition text-left">
                                    <div className={`w-9 h-9 rounded-full bg-gradient-to-b ${config.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                        {c.user?.username?.[0]?.toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-white text-sm font-bold truncate">{c.user?.fullName || c.user?.username}</p>
                                        <p className="text-gray-500 text-xs truncate">
                                            @{c.user?.username}{(c.user?.interests || [])[0]?.skillRating != null
                                                ? `  ${Number(c.user.interests[0].skillRating).toFixed(2)}★` : ''}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {showCreateModal && (
                <CreatePostModal
                    type="POST"
                    interests={myInterest ? [myInterest] : []}
                    initialTargets={[{ category: categoryUpper, subCategory: sub }]}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(post) => {
                        if (post.imageUrl || post.videoUrl) setMediaPosts(prev => [post, ...prev]);
                    }}
                />
            )}

            {peerReviewRivalId && (
                <PeerReviewModal
                    rivalId={peerReviewRivalId}
                    onClose={() => setPeerReviewRivalId(null)}
                />
            )}
        </div>
    );
}

export default SubCategoryPage;
