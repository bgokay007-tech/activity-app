import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/Navbar';

function pad(n) { return String(n).padStart(2, '0'); }
function dateStr(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const DATE_OPTIONS = Array.from({ length: 14 }, (_, i) => dateStr(i));
function dateLabel(str) {
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
}

const SLOT_TYPE_LABEL = { FULL_HOUR: 'Tam Saat', HALF_HOUR: 'Buçuklu', NINETY_MIN: '90 Dakika', VAR_DURATION: 'Esnek Saat', FLEXIBLE: 'Esnek Saat' };
const PAY_LABEL = { CASH: '💵 Nakit (Kortta)', EFT: '🏦 EFT / Havale', ONLINE: '🌐 Online', CREDIT_CARD: '💳 Kortta Kredi Kartı' };

// ── Kart Sepeti (üst seviyede, iç içe modal sorunu olmasın) ──────────────────
function CartModal({ visible, cart, onRemove, onCheckout, onClose, checkingOut }) {
    const [payment, setPayment] = useState('CASH');
    if (!visible) return null;
    const priceOf = (item) => item.slot?.priceByMethod?.[payment] ?? item.slot?.price ?? 0;
    const total = cart.reduce((sum, i) => sum + priceOf(i), 0);
    const cartAccepts = (method) => cart.length > 0 && cart.every(i => Array.isArray(i.venue?.acceptedPayments) && i.venue.acceptedPayments.includes(method));

    return (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-white font-bold text-lg">🛒 Sepet {cart.length > 0 ? `(${cart.length})` : ''}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                {cart.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-10">Sepetiniz boş.</p>
                ) : (
                    <>
                        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                            {cart.map(item => (
                                <div key={item.key} className="flex items-center gap-3 bg-gray-800/60 rounded-xl p-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-sm font-bold truncate">{item.venue.name} — {item.court.name}</p>
                                        <p className="text-gray-500 text-xs">{dateLabel(item.date)} · {item.slot.start}–{item.slot.end}</p>
                                    </div>
                                    <span className="text-purple-300 text-sm font-bold shrink-0">{priceOf(item) > 0 ? `${priceOf(item)}₺` : 'Ücretsiz'}</span>
                                    <button onClick={() => onRemove(item.key)} className="text-red-400 hover:text-red-300 text-lg shrink-0">✕</button>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center border-t border-gray-800 pt-3 mb-4">
                            <span className="text-gray-400 text-sm font-bold">Toplam</span>
                            <span className="text-white text-lg font-black">{total > 0 ? `${total}₺` : 'Ücretsiz'}</span>
                        </div>

                        <p className="text-gray-400 text-xs font-bold mb-2">Ödeme Yöntemi</p>
                        <div className="space-y-1.5 mb-4">
                            {['CASH', 'EFT', 'CREDIT_CARD'].filter(m => m === 'CASH' || cartAccepts(m)).map(m => (
                                <button key={m} onClick={() => setPayment(m)}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-bold border transition ${payment === m ? 'bg-purple-600/30 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                                    {PAY_LABEL[m]}
                                    {payment === m && <span>✓</span>}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl border border-gray-700 hover:bg-gray-700 transition">Kapat</button>
                    {cart.length > 0 && (
                        <button onClick={() => onCheckout(payment)} disabled={checkingOut}
                            className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-50 transition hover:opacity-90">
                            {checkingOut ? 'İşleniyor...' : 'Rezerve Et'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Kort sütunu: bir kortun secili tarihteki slotlari ────────────────────────
function CourtColumn({ court, data, cartKeys, onAddToCart }) {
    const [varStart, setVarStart] = useState(null);

    if (!data || data.loading) {
        return (
            <div className="w-44 shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-white font-bold text-sm mb-2">{court.name}</p>
                <p className="text-gray-500 text-xs text-center py-6">Yükleniyor...</p>
            </div>
        );
    }
    if (data.error || !data.type) {
        return (
            <div className="w-44 shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-white font-bold text-sm mb-2">{court.name}</p>
                <p className="text-red-400 text-xs text-center py-6">Yüklenemedi</p>
            </div>
        );
    }
    if (data.type === 'NOT_YET_OPEN') {
        return (
            <div className="w-44 shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-white font-bold text-sm mb-2">{court.name}</p>
                <p className="text-yellow-400 text-xs text-center py-6">⏳ {data.message || 'Henüz açılmadı'}</p>
            </div>
        );
    }
    if (data.type === 'MAINTENANCE') {
        return (
            <div className="w-44 shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-white font-bold text-sm mb-2">{court.name}</p>
                <p className="text-orange-400 text-xs text-center py-6">🔧 Bakımda</p>
            </div>
        );
    }

    if (data.type === 'VAR_DURATION' || data.type === 'FLEXIBLE') {
        const windows = data.windows || [];
        const DURATIONS = [60, 90, 120, 150, 180];
        return (
            <div className="w-52 shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-white font-bold text-sm mb-2">{court.name}</p>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                    {windows.length === 0 && <p className="text-gray-500 text-xs text-center py-6">Boş pencere yok</p>}
                    {windows.map((w, i) => {
                        const isSel = varStart?.start === w.start;
                        return (
                            <div key={i} className={`rounded-lg border p-2 ${isSel ? 'border-purple-500 bg-purple-600/10' : 'border-gray-700'}`}>
                                <button onClick={() => setVarStart(isSel ? null : w)} className="w-full text-left">
                                    <p className="text-gray-300 text-xs font-bold">{w.start}–{w.end}</p>
                                    <p className="text-gray-500 text-[10px]">{w.pricePerHour > 0 ? `${w.pricePerHour}₺/saat` : 'Ücretsiz'}</p>
                                </button>
                                {isSel && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {DURATIONS.filter(d => d <= w.durationMins).map(d => {
                                            const endM = toMins(w.start) + d;
                                            const end = toTime(endM);
                                            const price = w.pricePerHourByMethod ? Object.fromEntries(Object.entries(w.pricePerHourByMethod).map(([k, v]) => [k, Math.round(v * (d / 60))])) : undefined;
                                            const inCart = cartKeys.has(`${court.id}_${w.start}`);
                                            return (
                                                <button key={d} disabled={inCart}
                                                    onClick={() => onAddToCart(court, { start: w.start, end, price: price?.CASH ?? Math.round((w.pricePerHour || 0) * (d / 60)), priceByMethod: price })}
                                                    className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition ${inCart ? 'bg-green-600/20 border-green-600 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-purple-500'}`}>
                                                    {inCart ? '✓' : ''} {d < 60 ? `${d}dk` : `${d / 60}s`}
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
            <p className="text-gray-600 text-[10px] mb-2">{SLOT_TYPE_LABEL[data.type] || data.type}</p>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {slots.length === 0 && <p className="text-gray-500 text-xs text-center py-6">Slot yok</p>}
                {slots.map(s => {
                    const key = `${court.id}_${s.start}`;
                    const inCart = cartKeys.has(key);
                    const disabled = !s.free || s.maintenance || inCart;
                    return (
                        <button key={s.start} disabled={disabled}
                            onClick={() => onAddToCart(court, s, key)}
                            className={`w-full text-left px-2 py-1.5 rounded-lg border text-xs font-bold transition ${
                                inCart ? 'bg-green-600/20 border-green-600 text-green-400'
                                : !s.free || s.maintenance ? 'bg-gray-800/50 border-gray-800 text-gray-600 cursor-not-allowed'
                                : 'bg-gray-800 border-gray-700 text-gray-200 hover:border-purple-500'
                            }`}>
                            <span className="block">{s.start}–{s.end}</span>
                            <span className="block text-[10px] font-normal opacity-80">
                                {inCart ? '✓ Sepette' : !s.free ? (s.status === 'PENDING' ? '⏳ Onay Bekliyor' : 'Dolu') : s.maintenance ? '🔧 Bakım' : (s.price > 0 ? `${s.price}₺` : 'Ücretsiz')}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function toMins(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function toTime(m) { return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; }

// ── Tesis rezervasyon paneli (arama sonucundaki bir tesise tiklaninca acilir) ──
function VenueBookingPanel({ venue, onClose, cart, onAddToCart, onOpenCart }) {
    const [date, setDate] = useState(DATE_OPTIONS[0]);
    const [slotsByCourt, setSlotsByCourt] = useState({});

    // Sadece bu tesis + bu tarih icin sepette olanlar (kort+baslangic saati bazinda)
    const cartKeys = new Set(
        cart.filter(i => i.venue.id === venue.id && i.date === date).map(i => `${i.court.id}_${i.slot.start}`)
    );

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

    const contactLinks = venue.contactLinks && typeof venue.contactLinks === 'object' ? venue.contactLinks : {};
    const links = [
        { key: 'whatsapp', icon: '💬', label: 'WhatsApp', url: v => { const d = v.replace(/\D/g, ''); return `https://wa.me/${d.startsWith('0') ? '90' + d.slice(1) : d}`; }, value: contactLinks.whatsapp || venue.phone },
        { key: 'phone', icon: '📞', label: 'Ara', url: v => `tel:${v}`, value: contactLinks.phone || venue.phone },
        { key: 'instagram', icon: '📸', label: 'Instagram', url: v => `https://instagram.com/${v.replace('@', '')}`, value: contactLinks.instagram },
    ].filter(l => l.value);

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col" onClick={onClose}>
            <div className="bg-gray-950 flex-1 flex flex-col max-w-5xl w-full mx-auto my-0 sm:my-6 sm:rounded-2xl overflow-hidden border border-gray-800" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-white font-black text-lg truncate">{venue.name}</h3>
                        <p className="text-gray-500 text-xs truncate">📍 {venue.city}{venue.district ? ` / ${venue.district}` : ''}{venue.address ? ` — ${venue.address}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {cart.length > 0 && (
                            <button onClick={onOpenCart} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition">🛒 {cart.length}</button>
                        )}
                        <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">✕</button>
                    </div>
                </div>

                {links.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-5 pt-3 shrink-0">
                        {links.map(l => (
                            <a key={l.key} href={l.url(l.value)} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-300 font-bold transition">
                                <span>{l.icon}</span>{l.label}
                            </a>
                        ))}
                    </div>
                )}

                {/* Date chips */}
                <div className="flex gap-2 overflow-x-auto px-5 py-3 shrink-0">
                    {DATE_OPTIONS.map(d => (
                        <button key={d} onClick={() => setDate(d)}
                            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${date === d ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                            {dateLabel(d)}
                        </button>
                    ))}
                </div>

                {/* Court columns */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden px-5 pb-5">
                    <div className="flex gap-3 h-full">
                        {(venue.courts || []).map(court => (
                            <CourtColumn key={court.id} court={court} data={slotsByCourt[court.id]}
                                cartKeys={cartKeys}
                                onAddToCart={(c, slot) => onAddToCart(venue, c, slot, date)} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function VenueCard({ venue, onClick }) {
    return (
        <div onClick={onClick}
            className="bg-gray-900 border border-gray-800 hover:border-purple-500/50 rounded-2xl p-4 cursor-pointer transition">
            <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-white font-bold text-base">{venue.name}</h3>
                {venue.avgRating ? <span className="text-yellow-400 text-xs font-bold shrink-0">⭐ {venue.avgRating}</span> : null}
            </div>
            <p className="text-gray-500 text-xs mb-2">📍 {venue.city}{venue.district ? ` / ${venue.district}` : ''}{venue.address ? ` — ${venue.address}` : ''}</p>
            <div className="flex flex-wrap gap-1.5">
                <span className="bg-gray-800 text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded-full">🏟️ {(venue.courts || []).length} kort</span>
                {venue.openTime && <span className="bg-gray-800 text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded-full">⏰ {venue.openTime}–{venue.closeTime}</span>}
                {venue.phone && <span className="bg-gray-800 text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded-full">📞 {venue.phone}</span>}
            </div>
        </div>
    );
}

export default function VenuesPage() {
    const navigate = useNavigate();
    const [city, setCity] = useState('');
    const [name, setName] = useState('');
    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [activeVenue, setActiveVenue] = useState(null);
    const [cart, setCart] = useState([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [checkingOut, setCheckingOut] = useState(false);

    const search = async () => {
        setLoading(true);
        setSearched(true);
        try {
            const { data } = await api.get('/venues/search', { params: { city: city.trim() || undefined, name: name.trim() || undefined } });
            setVenues(data.items || []);
        } catch (err) { console.error(err); setVenues([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleAddToCart = (venue, court, slot, date) => {
        const key = `${venue.id}_${court.id}_${date}_${slot.start}`;
        setCart(prev => prev.some(i => i.key === key) ? prev : [...prev, { key, venue, court, slot, date }]);
    };
    const handleRemoveFromCart = (key) => setCart(prev => prev.filter(i => i.key !== key));

    const handleCheckout = async (paymentMethod) => {
        setCheckingOut(true);
        const failed = [];
        const succeeded = [];
        for (const item of cart) {
            try {
                await api.post(`/venues/${item.venue.id}/courts/${item.court.id}/reserve`, {
                    date: item.date, startTime: item.slot.start, endTime: item.slot.end, paymentMethod,
                });
                succeeded.push(item.key);
            } catch (err) {
                failed.push({ key: item.key, message: err?.response?.data?.message || 'Hata' });
            }
        }
        setCart(prev => prev.filter(i => !succeeded.includes(i.key)));
        setCheckingOut(false);
        if (failed.length === 0) {
            alert('✅ Rezervasyon(lar) oluşturuldu!');
            setCartOpen(false);
        } else {
            alert(`${succeeded.length} rezervasyon başarılı, ${failed.length} başarısız:\n` + failed.map(f => f.message).join('\n'));
        }
    };

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} title="Tesis / Kort Ara" />

            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
                <div className="flex flex-wrap gap-2 mb-6">
                    <input value={city} onChange={e => setCity(e.target.value)} placeholder="Şehir"
                        onKeyDown={e => e.key === 'Enter' && search()}
                        className="flex-1 min-w-[140px] bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500" />
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Tesis adı"
                        onKeyDown={e => e.key === 'Enter' && search()}
                        className="flex-1 min-w-[140px] bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500" />
                    <button onClick={search} disabled={loading}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50">
                        {loading ? 'Aranıyor...' : '🔍 Ara'}
                    </button>
                </div>

                {searched && !loading && venues.length === 0 && (
                    <p className="text-gray-500 text-center py-16">Sonuç bulunamadı.</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {venues.map(v => (
                        <VenueCard key={v.id} venue={v} onClick={() => setActiveVenue(v)} />
                    ))}
                </div>
            </div>

            {cart.length > 0 && (
                <button onClick={() => setCartOpen(true)}
                    className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 hover:opacity-90 transition z-40">
                    🛒 Sepet ({cart.length})
                </button>
            )}

            {activeVenue && (
                <VenueBookingPanel
                    venue={activeVenue}
                    onClose={() => setActiveVenue(null)}
                    cart={cart}
                    onAddToCart={handleAddToCart}
                    onOpenCart={() => setCartOpen(true)}
                />
            )}

            <CartModal
                visible={cartOpen}
                cart={cart}
                onRemove={handleRemoveFromCart}
                onCheckout={handleCheckout}
                onClose={() => setCartOpen(false)}
                checkingOut={checkingOut}
            />
        </div>
    );
}
