import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../services/api';
import Navbar from '../components/Navbar';

const SPORTS = [
    { id: '',             label: 'All Sports' },
    { id: 'tennis',       label: '🎾 Tennis'      },
    { id: 'padel',        label: '🏓 Padel'        },
    { id: 'volleyball',   label: '🏐 Volleyball'   },
    { id: 'football',     label: '⚽ Football'     },
    { id: 'basketball',   label: '🏀 Basketball'   },
    { id: 'swimming',     label: '🏊 Swimming'     },
    { id: 'running',      label: '🏃 Running'      },
    { id: 'cycling',      label: '🚴 Cycling'      },
    { id: 'boxing',       label: '🥊 Boxing'       },
    { id: 'martial_arts', label: '🥋 Martial Arts' },
];

const SURFACE_LABEL = {
    hard:            'Hard Court',
    clay:            'Clay',
    grass:           'Grass',
    artificial_grass:'Artificial Grass',
    carpet:          'Carpet',
    synthetic:       'Synthetic',
    sand:            'Sand',
    hali_saha:       'Artificial Turf',
    cim_saha:        'Grass Field',
    futsal:          'Futsal',
    sokak:           'Street / Concrete',
    beach:           'Beach',
    balon:           'Bubble Football',
    HALI_SAHA:       'Artificial Turf',
    CIM_SAHA:        'Grass Field',
    FUTSAL:          'Futsal',
    SOKAK:           'Street / Concrete',
    BEACH:           'Beach',
    BALON:           'Bubble Football',
};

function CourtCard({ court, myId, onEdit, onDelete }) {
    const isOwn = court.addedBy === myId || court.user?.id === myId;
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition">
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold text-sm truncate">{court.name}</h3>
                    {court.address && <p className="text-gray-500 text-xs truncate">{court.address}</p>}
                    <p className="text-gray-500 text-xs">{court.city}{court.country ? `, ${court.country}` : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {court.verified && (
                        <span className="text-green-400 text-[10px] font-bold bg-green-500/10 px-2 py-0.5 rounded-full">✓ Verified</span>
                    )}
                    {isOwn && (
                        <div className="flex gap-1">
                            <button onClick={() => onEdit(court)} className="text-gray-500 hover:text-white text-xs px-1.5 py-0.5 rounded transition">✏️</button>
                            <button onClick={() => onDelete(court.id)} className="text-gray-500 hover:text-red-400 text-xs px-1.5 py-0.5 rounded transition">🗑️</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Sport */}
            <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs bg-purple-600/20 text-purple-300 px-2 py-0.5 rounded-full capitalize font-medium">
                    {SPORTS.find(s => s.id === court.sport)?.label || court.sport}
                </span>
                {court.surface && (
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                        {SURFACE_LABEL[court.surface] || court.surface}
                    </span>
                )}
                {court.indoor && <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">🏠 Indoor</span>}
                {!court.indoor && court.surface && <span className="text-xs bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-full">🌤️ Outdoor</span>}
                {court.lights && <span className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full">💡 Lights</span>}
                {court.fee ? (
                    <span className="text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full">
                        💰 {court.feeAmount || 'Fee'}
                    </span>
                ) : (
                    <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">✅ Free</span>
                )}
            </div>

            {court.description && (
                <p className="text-gray-500 text-xs mt-2 line-clamp-2">{court.description}</p>
            )}

            {court.lat && court.lng && (
                <a
                    href={`https://www.google.com/maps?q=${court.lat},${court.lng}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 text-xs mt-2 transition"
                    onClick={e => e.stopPropagation()}
                >
                    📍 View on Map →
                </a>
            )}

            <p className="text-gray-700 text-[10px] mt-2">Added by @{court.user?.username}</p>
        </div>
    );
}

function CourtForm({ court, onClose, onSave }) {
    const [form, setForm] = useState({
        name: court?.name || '',
        address: court?.address || '',
        city: court?.city || '',
        country: court?.country || '',
        sport: court?.sport || 'tennis',
        surface: court?.surface || '',
        indoor: court?.indoor || false,
        fee: court?.fee || false,
        feeAmount: court?.feeAmount || '',
        lights: court?.lights || false,
        description: court?.description || '',
        lat: court?.lat || '',
        lng: court?.lng || '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const payload = { ...form, lat: form.lat || null, lng: form.lng || null };
            const { data } = court?.id
                ? await api.put(`/courts/${court.id}`, payload)
                : await api.post('/courts', payload);
            onSave(data, !!court?.id);
            onClose();
        } catch (err) { console.error(err); }
        finally { setIsSaving(false); }
    };

    const SURFACES = ['hard','clay','grass','artificial_grass','carpet','synthetic','sand','hali_saha','cim_saha','futsal','sokak','beach','balon'];

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800 flex-shrink-0">
                    <h3 className="text-white font-bold">{court?.id ? '✏️ Edit Court' : '+ Add Court'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                        placeholder="Court / Field name *"
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm" />

                    <div className="grid grid-cols-2 gap-3">
                        <input required value={form.city} onChange={e => setForm({...form, city: e.target.value})}
                            placeholder="City *"
                            className="bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none text-sm" />
                        <input value={form.country} onChange={e => setForm({...form, country: e.target.value})}
                            placeholder="Country"
                            className="bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none text-sm" />
                    </div>

                    <input value={form.address} onChange={e => setForm({...form, address: e.target.value})}
                        placeholder="Full address"
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none text-sm" />

                    {/* Sport */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">Sport</label>
                        <select value={form.sport} onChange={e => setForm({...form, sport: e.target.value})}
                            className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none text-sm">
                            {SPORTS.filter(s => s.id).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                    </div>

                    {/* Surface */}
                    <div>
                        <label className="text-gray-400 text-xs mb-2 block">Surface type</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {SURFACES.map(s => (
                                <button key={s} type="button" onClick={() => setForm({...form, surface: form.surface === s ? '' : s})}
                                    className={`py-1.5 rounded-lg text-xs font-medium border transition ${form.surface === s ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                                    {SURFACE_LABEL[s]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Toggles */}
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { key: 'indoor', label: '🏠 Indoor' },
                            { key: 'lights', label: '💡 Lights' },
                            { key: 'fee',    label: '💰 Fee'    },
                        ].map(t => (
                            <button key={t.key} type="button"
                                onClick={() => setForm(f => ({...f, [t.key]: !f[t.key]}))}
                                className={`py-2 rounded-xl text-xs font-bold border transition ${form[t.key] ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                    {form.fee && (
                        <input value={form.feeAmount} onChange={e => setForm({...form, feeAmount: e.target.value})}
                            placeholder="Fee amount (e.g. 150 TL/hr)"
                            className="w-full bg-gray-800 text-white rounded-xl px-4 py-2 border border-gray-700 focus:outline-none text-sm" />
                    )}

                    {/* Coordinates */}
                    <div className="grid grid-cols-2 gap-3">
                        <input type="number" step="any" value={form.lat} onChange={e => setForm({...form, lat: e.target.value})}
                            placeholder="Latitude"
                            className="bg-gray-800 text-white rounded-xl px-4 py-2 border border-gray-700 focus:outline-none text-sm" />
                        <input type="number" step="any" value={form.lng} onChange={e => setForm({...form, lng: e.target.value})}
                            placeholder="Longitude"
                            className="bg-gray-800 text-white rounded-xl px-4 py-2 border border-gray-700 focus:outline-none text-sm" />
                    </div>

                    <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                        placeholder="Description (optional)" rows={2}
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none resize-none text-sm" />
                </form>
                <div className="px-6 py-4 border-t border-gray-800 flex gap-3 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl border border-gray-700 text-sm">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSaving}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-50 text-sm">
                        {isSaving ? 'Saving...' : court?.id ? 'Update' : 'Add Court'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ImportOSMModal({ onClose, onImported }) {
    const [city, setCity]     = useState('');
    const [sport, setSport]   = useState('tennis');
    const [loading, setLoading] = useState(false);
    const [result, setResult]  = useState(null);

    const handleImport = async () => {
        if (!city) return;
        setLoading(true);
        try {
            const { data } = await api.post('/courts/import-osm', { city, sport });
            setResult(data);
            onImported();
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-white font-bold">🗺️ Import from OpenStreetMap</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>
                <div className="space-y-3">
                    <input value={city} onChange={e => setCity(e.target.value)}
                        placeholder="City name (e.g. Antalya, İstanbul)"
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm" />
                    <select value={sport} onChange={e => setSport(e.target.value)}
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none text-sm">
                        {SPORTS.filter(s => s.id).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    {result && (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-green-300 text-sm">
                            ✓ {result.message}
                        </div>
                    )}
                    <button onClick={handleImport} disabled={loading || !city}
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-50 text-sm">
                        {loading ? '⏳ Importing...' : '🗺️ Import Courts'}
                    </button>
                    <p className="text-gray-600 text-xs text-center">Data from OpenStreetMap — may take a few seconds</p>
                </div>
            </div>
        </div>
    );
}

export default function CourtsPage() {
    const navigate = useNavigate();
    const myId     = useSelector(state => state.auth.user?.id) || (() => {
        try { const t = localStorage.getItem('activity_token'); return t ? JSON.parse(atob(t.split('.')[1])).userId : null; } catch { return null; }
    })();

    const [courts, setCourts]         = useState([]);
    const [total, setTotal]           = useState(0);
    const [isLoading, setIsLoading]   = useState(true);
    const [sportFilter, setSportFilter] = useState('');
    const [cityFilter, setCityFilter]   = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [showAdd, setShowAdd]         = useState(false);
    const [editCourt, setEditCourt]     = useState(null);
    const [showImport, setShowImport]   = useState(false);

    const fetchCourts = async (sport = sportFilter, city = cityFilter) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (sport) params.set('sport', sport);
            if (city)  params.set('city', city);
            const { data } = await api.get(`/courts?${params}`);
            setCourts(data.courts);
            setTotal(data.total);
        } catch (err) { console.error(err); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { fetchCourts(); }, []);

    const handleSearch = () => {
        setCityFilter(searchInput);
        fetchCourts(sportFilter, searchInput);
    };

    const handleSportChange = (s) => {
        setSportFilter(s);
        fetchCourts(s, cityFilter);
    };

    const handleSave = (court, isEdit) => {
        if (isEdit) {
            setCourts(prev => prev.map(c => c.id === court.id ? court : c));
        } else {
            setCourts(prev => [court, ...prev]);
            setTotal(t => t + 1);
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/courts/${id}`);
            setCourts(prev => prev.filter(c => c.id !== id));
            setTotal(t => t - 1);
        } catch (err) { console.error(err); }
    };

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar />
            <div className="max-w-5xl mx-auto px-6 py-8">

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-white font-black text-2xl">🏟️ Courts & Fields</h1>
                        <p className="text-gray-500 text-sm mt-1">{total} venues in database</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowImport(true)}
                            className="bg-gray-800 border border-gray-700 text-gray-300 hover:text-white font-bold px-4 py-2 rounded-xl text-sm transition">
                            🗺️ Import OSM
                        </button>
                        <button onClick={() => setShowAdd(true)}
                            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold px-4 py-2 rounded-xl text-sm hover:opacity-90 transition">
                            + Add Court
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex gap-3 mb-6">
                    <div className="flex flex-1 gap-2">
                        <input
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            placeholder="🔍 Search by city..."
                            className="flex-1 bg-gray-900 text-white rounded-xl px-4 py-2.5 border border-gray-800 focus:outline-none focus:border-purple-500 text-sm"
                        />
                        <button onClick={handleSearch}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition">
                            Search
                        </button>
                    </div>
                </div>

                {/* Sport tabs */}
                <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
                    {SPORTS.map(s => (
                        <button key={s.id} onClick={() => handleSportChange(s.id)}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${sportFilter === s.id ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}>
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Court grid */}
                {isLoading ? (
                    <p className="text-gray-500 text-center py-16">Loading...</p>
                ) : courts.length === 0 ? (
                    <div className="text-center py-16 bg-gray-900 rounded-2xl border border-gray-800">
                        <p className="text-4xl mb-3">🏟️</p>
                        <p className="text-gray-400 mb-3">No courts found.</p>
                        <button onClick={() => setShowAdd(true)} className="text-purple-400 hover:text-purple-300 text-sm transition">
                            + Add the first court
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {courts.map(court => (
                            <CourtCard key={court.id} court={court} myId={myId}
                                onEdit={c => setEditCourt(c)}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                )}
            </div>

            {showAdd    && <CourtForm onClose={() => setShowAdd(false)} onSave={handleSave} />}
            {editCourt  && <CourtForm court={editCourt} onClose={() => setEditCourt(null)} onSave={handleSave} />}
            {showImport && <ImportOSMModal onClose={() => setShowImport(false)} onImported={() => fetchCourts()} />}
        </div>
    );
}
