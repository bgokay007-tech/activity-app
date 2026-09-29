import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

const CAT_COLOR = {
    SPORTS: { text: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/40', grad: 'from-green-600 to-emerald-500' },
    SOCIAL: { text: 'text-blue-400',  bg: 'bg-blue-500/15',  border: 'border-blue-500/40',  grad: 'from-blue-600 to-cyan-500' },
    ARTS:   { text: 'text-pink-400',  bg: 'bg-pink-500/15',  border: 'border-pink-500/40',  grad: 'from-pink-600 to-rose-500' },
    GAMES:  { text: 'text-orange-400',bg: 'bg-orange-500/15',border: 'border-orange-500/40',grad: 'from-orange-600 to-amber-500' },
};

// ── Bildirim filtresi modalı ──
export default function ActivityAlertModal({ open, onClose, categories, onSaved }) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [cats, setCats] = useState([]);
    const [subs, setSubs] = useState([]);
    const [cities, setCities] = useState([]);
    const [cityInput, setCityInput] = useState('');
    const [useProximity, setUseProximity] = useState(false);
    const [radiusKm, setRadiusKm] = useState(25);
    const [artists, setArtists] = useState([]);
    const [artistInput, setArtistInput] = useState('');

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        api.get('/activity-alerts/me').then(({ data }) => {
            setEnabled(!!data.enabled);
            setCats(data.categories || []);
            setSubs(data.subCategories || []);
            setCities(data.cities || []);
            setUseProximity(!!data.useProximity);
            setRadiusKm(data.radiusKm || 25);
            setArtists(data.favoriteArtists || []);
        }).catch(() => {}).finally(() => setLoading(false));
    }, [open]);

    const toggleCat = (key) => {
        setCats(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            if (!next.includes(key)) {
                const catSubs = (categories.find(c => c.id === key)?.subCategories || []).map(s => s.id);
                setSubs(p => p.filter(s => !catSubs.includes(s)));
            }
            return next;
        });
    };
    const toggleSub = (key) => setSubs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    const addCity = () => {
        const v = cityInput.trim();
        if (v && !cities.some(c => c.toLowerCase() === v.toLowerCase())) setCities(prev => [...prev, v]);
        setCityInput('');
    };
    const addArtist = () => {
        const v = artistInput.trim();
        if (v && !artists.some(a => a.toLowerCase() === v.toLowerCase())) setArtists(prev => [...prev, v]);
        setArtistInput('');
    };

    const visibleSubs = (cats.length === 0 ? categories : categories.filter(c => cats.includes(c.id)))
        .flatMap(c => c.subCategories || []);

    const save = async () => {
        setSaving(true);
        try {
            await api.put('/activity-alerts/me', {
                enabled, categories: cats, subCategories: subs, cities,
                useProximity, radiusKm, favoriteArtists: artists,
            });
            onSaved?.(enabled);
            onClose();
        } catch (e) {
            alert(e?.response?.data?.message || t('activity.alert_save_failed'));
        } finally { setSaving(false); }
    };

    if (!open) return null;
    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-black text-lg">🔔 {t('activity.alert_title')}</h3>
                    <button onClick={() => setEnabled(v => !v)}
                        className={`w-12 h-7 rounded-full border transition relative ${enabled ? 'bg-purple-600/60 border-purple-500' : 'bg-gray-800 border-gray-700'}`}>
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full transition ${enabled ? 'right-0.5 bg-purple-400' : 'left-0.5 bg-gray-500'}`} />
                    </button>
                </div>

                {loading ? <p className="text-gray-500 text-sm text-center py-10">{t('common.loading')}</p> : (
                    <div className="space-y-4">
                        <div>
                            <p className="text-gray-400 text-xs font-bold mb-2">{t('activity.alert_category')}</p>
                            <div className="flex flex-wrap gap-2">
                                {categories.map(cat => {
                                    const active = cats.includes(cat.id);
                                    const c = CAT_COLOR[cat.id] || CAT_COLOR.SPORTS;
                                    return (
                                        <button key={cat.id} onClick={() => toggleCat(cat.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${active ? `${c.bg} ${c.border} ${c.text}` : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                                            {cat.emoji} {cat.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <p className="text-gray-400 text-xs font-bold mb-2">{t('activity.alert_sub')}</p>
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                {visibleSubs.map(sub => {
                                    const active = subs.includes(sub.id);
                                    return (
                                        <button key={sub.id} onClick={() => toggleSub(sub.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${active ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                                            {sub.emoji} {sub.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <p className="text-gray-400 text-xs font-bold mb-2">{t('activity.alert_city_label')}</p>
                            <div className="flex gap-2">
                                <input value={cityInput} onChange={e => setCityInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addCity()}
                                    placeholder={t('activity.alert_city_ph')}
                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                                <button onClick={addCity} className="bg-purple-600 text-white text-xs font-bold px-4 rounded-lg">{t('activity.alert_add')}</button>
                            </div>
                            {cities.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {cities.map(c => (
                                        <button key={c} onClick={() => setCities(prev => prev.filter(x => x !== c))}
                                            className="bg-purple-600/15 border border-purple-500/40 text-purple-300 text-xs font-bold px-2.5 py-1 rounded-full">
                                            📍 {c}  ✕
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <button onClick={() => setUseProximity(v => !v)} className="flex items-center justify-between w-full">
                                <span className="text-gray-400 text-xs font-bold">📡 {t('activity.alert_proximity')}</span>
                                <span className={`w-10 h-6 rounded-full border relative transition ${useProximity ? 'bg-purple-600/60 border-purple-500' : 'bg-gray-800 border-gray-700'}`}>
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full transition ${useProximity ? 'right-0.5 bg-purple-400' : 'left-0.5 bg-gray-500'}`} />
                                </span>
                            </button>
                            {useProximity && (
                                <div className="flex gap-2 mt-2">
                                    {[10, 25, 50, 100].map(r => (
                                        <button key={r} onClick={() => setRadiusKm(r)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${radiusKm === r ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                                            {r} km
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="text-gray-400 text-xs font-bold mb-2">🎵 {t('activity.alert_artist_label')}</p>
                            <div className="flex gap-2">
                                <input value={artistInput} onChange={e => setArtistInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addArtist()}
                                    placeholder={t('activity.alert_artist_ph')}
                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                                <button onClick={addArtist} className="bg-purple-600 text-white text-xs font-bold px-4 rounded-lg">{t('activity.alert_add')}</button>
                            </div>
                            {artists.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {artists.map(a => (
                                        <button key={a} onClick={() => setArtists(prev => prev.filter(x => x !== a))}
                                            className="bg-purple-600/15 border border-purple-500/40 text-purple-300 text-xs font-bold px-2.5 py-1 rounded-full">
                                            🎤 {a}  ✕
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex gap-3 mt-5">
                    <button onClick={onClose} className="flex-1 bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl border border-gray-700 hover:bg-gray-700 transition">
                        {t('activity.alert_cancel')}
                    </button>
                    <button onClick={save} disabled={saving}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition">
                        {saving ? '...' : t('activity.alert_save')}
                    </button>
                </div>
            </div>
        </div>
    );
}
