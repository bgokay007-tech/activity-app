import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../services/api';

const CATEGORIES = [
    { value: '', label: 'All categories' },
    { value: 'SPORTS', label: 'Sports' },
    { value: 'SOCIAL', label: 'Social' },
    { value: 'ARTS', label: 'Arts' },
    { value: 'GAMES', label: 'Games' },
];

function TournamentCard({ t }) {
    const [open, setOpen] = useState(false);
    const bracket = t.bracketData;
    const snapshot = t.ratingSnapshot || {};

    const teamName = (team) => team ? `${team.p1?.firstName || ''}/${team.p2?.firstName || ''}` : '?';
    const teamFull = (team) => team ? `${team.p1?.firstName || ''} ${team.p1?.lastName || ''} & ${team.p2?.firstName || ''} ${team.p2?.lastName || ''}` : '?';

    const winner = bracket?.final?.winner != null && bracket?.teams
        ? bracket.teams.find(t => t.id === bracket.final.winner)
        : null;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <button onClick={() => setOpen(v => !v)} className="w-full text-left p-4 hover:bg-gray-800/40 transition">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-bold text-sm truncate">{t.name}</span>
                            <span className="text-gray-600 text-[10px] border border-gray-700 rounded px-1.5 py-0.5">{t.type?.replace('_', ' ')}</span>
                            {winner && <span className="text-yellow-400 text-[10px] font-bold">🏆 {teamFull(winner)}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {t.subCategory && <span className="text-purple-400 text-xs font-bold">{t.subCategory}</span>}
                            {(t.city || t.location) && <span className="text-gray-500 text-xs">📍 {t.city || t.location}</span>}
                            {t.surface && <span className="text-gray-500 text-xs">🎾 {t.surface}</span>}
                            {t.completedAt && (
                                <span className="text-gray-600 text-xs">
                                    {new Date(t.completedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                            )}
                        </div>
                    </div>
                    <span className="text-gray-500 text-sm flex-shrink-0">{open ? '↑' : '↓'}</span>
                </div>
            </button>

            {open && bracket && (
                <div className="border-t border-gray-800 p-4 space-y-4">
                    {/* Teams */}
                    {bracket.teams?.length > 0 && (
                        <div>
                            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide mb-2">👫 Teams</p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {bracket.teams.map(team => (
                                    <div key={team.id} className={`rounded-xl px-3 py-2 text-xs flex items-center gap-1.5 ${bracket.final?.winner === team.id ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-gray-800'}`}>
                                        <span className="text-gray-600 font-mono w-5 flex-shrink-0">T{team.id + 1}</span>
                                        <span className="text-white truncate">{teamFull(team)}</span>
                                        {bracket.final?.winner === team.id && <span className="ml-auto text-yellow-400 text-[10px] font-black">🏆</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* League matches */}
                    {[1, 2, 3].map(round => {
                        const roundMatches = (bracket.matches || []).filter(m => m.round === round && m.played);
                        if (!roundMatches.length) return null;
                        return (
                            <div key={round}>
                                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide mb-2">Round {round}</p>
                                <div className="space-y-1">
                                    {roundMatches.map(m => {
                                        const sets = m.sets || [];
                                        const t1w = sets.filter(s => (parseInt(s.t1) || 0) > (parseInt(s.t2) || 0)).length;
                                        const t2w = sets.filter(s => (parseInt(s.t2) || 0) > (parseInt(s.t1) || 0)).length;
                                        const mWinner = m.winner ?? (t1w > t2w ? m.t1 : t2w > t1w ? m.t2 : null);
                                        const t1 = bracket.teams?.find(t => t.id === m.t1);
                                        const t2 = bracket.teams?.find(t => t.id === m.t2);
                                        return (
                                            <div key={m.id} className="flex items-center gap-2 bg-gray-800/60 rounded-xl px-3 py-2 text-xs">
                                                <span className={`flex-1 truncate ${mWinner === m.t1 ? 'text-green-400 font-bold' : 'text-gray-400'}`}>{teamName(t1)}</span>
                                                <span className="text-gray-500 flex-shrink-0">
                                                    {sets.map(s => `${s.t1||0}-${s.t2||0}`).join(', ')}
                                                    <span className="ml-1 text-gray-700">({t1w}-{t2w})</span>
                                                </span>
                                                <span className={`flex-1 truncate text-right ${mWinner === m.t2 ? 'text-green-400 font-bold' : 'text-gray-400'}`}>{teamName(t2)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {/* Final */}
                    {bracket.final?.played && (
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-3">
                            <p className="text-yellow-400 text-[10px] font-bold uppercase tracking-wide mb-2">🏆 Final</p>
                            {(() => {
                                const f = bracket.final;
                                const sets = f.sets || [];
                                const t1w = sets.filter(s => (parseInt(s.t1) || 0) > (parseInt(s.t2) || 0)).length;
                                const t2w = sets.filter(s => (parseInt(s.t2) || 0) > (parseInt(s.t1) || 0)).length;
                                const t1 = bracket.teams?.find(t => t.id === f.t1);
                                const t2 = bracket.teams?.find(t => t.id === f.t2);
                                return (
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className={`flex-1 truncate font-bold ${f.winner === f.t1 ? 'text-yellow-400' : 'text-gray-400'}`}>{teamFull(t1)}</span>
                                        <span className="text-gray-400 flex-shrink-0 font-mono">
                                            {sets.map(s => `${s.t1||0}-${s.t2||0}`).join(', ')} ({t1w}-{t2w})
                                        </span>
                                        <span className={`flex-1 truncate font-bold text-right ${f.winner === f.t2 ? 'text-yellow-400' : 'text-gray-400'}`}>{teamFull(t2)}</span>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Rating snapshot */}
                    {Object.keys(snapshot).length > 0 && (
                        <div>
                            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide mb-2">📊 Player Ratings at completion</p>
                            <div className="grid grid-cols-2 gap-1">
                                {Object.entries(snapshot).map(([uid, snap]) => (
                                    <div key={uid} className="bg-gray-800 rounded-xl px-3 py-2 text-xs flex items-center justify-between gap-2">
                                        <span className="text-gray-300 truncate">{snap.fullName || snap.username}</span>
                                        <span className="text-purple-400 font-bold flex-shrink-0">{snap.totalPoints}pts</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function RivalCard({ r }) {
    const [open, setOpen] = useState(false);
    const score = r.score || {};
    const snapshot = score.ratingSnapshot || {};
    const sets = Array.isArray(score.sets) ? score.sets : [];
    const winner = score.winner; // 'sender' | 'opponent' | 'draw'

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <button onClick={() => setOpen(v => !v)} className="w-full text-left p-4 hover:bg-gray-800/40 transition">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-bold text-sm">{r.sender?.fullName || r.sender?.username}</span>
                            <span className="text-gray-600 text-[10px]">vs</span>
                            {Array.isArray(r.participants) && r.participants[0] && (
                                <span className="text-gray-300 text-sm">{r.participants[0].fullName || r.participants[0].username}</span>
                            )}
                            {winner && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${winner === 'draw' ? 'text-gray-400 border border-gray-600' : 'text-green-400 border border-green-500/30'}`}>
                                    {winner === 'draw' ? 'Draw' : `🏆 ${winner === 'sender' ? (r.sender?.fullName || r.sender?.username) : (r.participants?.[0]?.fullName || r.participants?.[0]?.username)}`}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {r.subCategory && <span className="text-purple-400 text-xs font-bold">{r.subCategory}</span>}
                            <span className="text-gray-600 text-[10px] border border-gray-700 rounded px-1.5 py-0.5">{r.matchType} · {r.matchMode}</span>
                            {r.location && <span className="text-gray-500 text-xs">📍 {r.location}</span>}
                            {r.courtName && <span className="text-gray-500 text-xs">🏟️ {r.courtName}</span>}
                            {r.completedAt && (
                                <span className="text-gray-600 text-xs">
                                    {new Date(r.completedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                            )}
                        </div>
                    </div>
                    <span className="text-gray-500 text-sm flex-shrink-0">{open ? '↑' : '↓'}</span>
                </div>
            </button>

            {open && (
                <div className="border-t border-gray-800 p-4 space-y-3">
                    {/* Score sets */}
                    {sets.length > 0 && (
                        <div>
                            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide mb-2">Score</p>
                            <div className="flex gap-2 flex-wrap">
                                {sets.map((s, i) => (
                                    <span key={i} className="bg-gray-800 rounded-lg px-3 py-1 text-xs font-mono text-white">
                                        Set {i + 1}: <span className={parseInt(s.sender) > parseInt(s.opponent) ? 'text-green-400' : 'text-gray-400'}>{s.sender}</span>
                                        {' – '}
                                        <span className={parseInt(s.opponent) > parseInt(s.sender) ? 'text-green-400' : 'text-gray-400'}>{s.opponent}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Rating snapshot */}
                    {Object.keys(snapshot).length > 0 && (
                        <div>
                            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide mb-2">📊 Rating changes</p>
                            <div className="space-y-1">
                                {Object.entries(snapshot).map(([uid, snap]) => (
                                    <div key={uid} className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2 text-xs">
                                        <span className="text-gray-300 truncate">{snap.username}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-500">{snap.skillRating_before?.toFixed(2)} → {snap.skillRating_after?.toFixed(2)}</span>
                                            <span className={`font-bold ${snap.change > 0 ? 'text-green-400' : snap.change < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                                                {snap.change > 0 ? `+${snap.change}` : snap.change}pts
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ArchivePage() {
    const navigate = useNavigate();
    const [tab, setTab]             = useState('tournaments'); // 'tournaments' | 'rivals'
    const [loading, setLoading]     = useState(false);
    const [data, setData]           = useState({ tournaments: [], rivals: [] });

    // Filters
    const [category, setCategory]   = useState('');
    const [subCategory, setSubCategory] = useState('');
    const [city, setCity]           = useState('');
    const [court, setCourt]         = useState('');
    const [dateFrom, setDateFrom]   = useState('');
    const [dateTo, setDateTo]       = useState('');

    const fetchArchive = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (category)    params.set('category', category);
            if (subCategory) params.set('subCategory', subCategory);
            if (city)        params.set('city', city);
            if (court)       params.set('court', court);
            if (dateFrom)    params.set('dateFrom', dateFrom);
            if (dateTo)      params.set('dateTo', dateTo);
            const { data: res } = await api.get(`/archive?${params}`);
            setData(res);
        } catch { /* ignore */ } finally { setLoading(false); }
    };

    useEffect(() => { fetchArchive(); }, []);

    const handleFilter = (e) => { e.preventDefault(); fetchArchive(); };

    const items = tab === 'tournaments' ? data.tournaments : data.rivals;

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar title="Archive" />
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

                {/* Filter bar */}
                <form onSubmit={handleFilter} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                    <p className="text-white font-bold text-sm">🔍 Filter Archive</p>
                    <div className="grid grid-cols-2 gap-2">
                        <select value={category} onChange={e => { setCategory(e.target.value); setSubCategory(''); }}
                            className="col-span-2 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-gray-300 text-sm focus:outline-none focus:border-purple-500">
                            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        <input value={subCategory} onChange={e => setSubCategory(e.target.value)} placeholder="Branch (e.g. football)"
                            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500" />
                        <input value={city} onChange={e => setCity(e.target.value)} placeholder="City (il)"
                            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500" />
                        <input value={court} onChange={e => setCourt(e.target.value)} placeholder="Court / Venue"
                            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500" />
                        <div className="flex flex-col gap-1">
                            <label className="text-gray-600 text-[10px] pl-1">From</label>
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-gray-600 text-[10px] pl-1">To</label>
                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded-xl text-sm transition">
                        Apply Filters
                    </button>
                </form>

                {/* Tabs */}
                <div className="flex bg-gray-900 border border-gray-800 rounded-2xl p-1 gap-1">
                    {[
                        { key: 'tournaments', label: `🏆 Tournaments (${data.tournaments.length})` },
                        { key: 'rivals',      label: `⚔️ Find Rival (${data.rivals.length})` },
                    ].map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`flex-1 py-2 rounded-xl text-sm font-bold transition ${tab === t.key ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                {loading ? (
                    <div className="text-center py-16">
                        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-2xl">
                        <p className="text-4xl mb-3">📦</p>
                        <p className="text-white font-bold">No archived {tab} yet</p>
                        <p className="text-gray-500 text-sm mt-1">Completed items will appear here.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tab === 'tournaments'
                            ? items.map(t => <TournamentCard key={t.id} t={t} />)
                            : items.map(r => <RivalCard key={r.id} r={r} />)
                        }
                    </div>
                )}
            </div>
        </div>
    );
}
