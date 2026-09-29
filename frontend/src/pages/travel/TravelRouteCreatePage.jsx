import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import Navbar from '../../components/Navbar';
import CityAutocomplete from '../../components/CityAutocomplete';
import { INPUT, LABEL, PRIMARY_BTN, chip, MediaStrip, uploadFiles } from './travelShared';

export default function TravelRouteCreatePage() {
    const { t } = useTranslation();
    const tv = (k, o) => t(`travel.${k}`, o);
    const navigate = useNavigate();
    const fileRef = useRef(null);
    const [title, setTitle] = useState('');
    const [startPlace, setStartPlace] = useState('');
    const [endPlace, setEndPlace] = useState('');
    const [stops, setStops] = useState([]);
    const [distanceKm, setDistanceKm] = useState('');
    const [durationText, setDurationText] = useState('');
    const [difficulty, setDifficulty] = useState(null);
    const [experience, setExperience] = useState('');
    const [media, setMedia] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    const onFiles = async (e) => {
        const files = e.target.files;
        if (!files?.length) return;
        setUploading(true);
        try {
            const added = await uploadFiles(files);
            setMedia(prev => [...prev, ...added].slice(0, 20));
        } catch (err) {
            alert(err?.response?.data?.message || tv('actionFailed'));
        } finally { setUploading(false); e.target.value = ''; }
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!title.trim() || !startPlace.trim()) { alert(tv('tvRequiredRoute')); return; }
        setSaving(true);
        try {
            const { data } = await api.post('/travel/routes', {
                title, startPlace, endPlace, stops: stops.filter(x => x.trim()),
                distanceKm: distanceKm.replace(',', '.'), durationText, difficulty, experience, media,
            });
            alert(tv('tvRouteCreated'));
            navigate(`/travel/routes/${data.id}`, { replace: true });
        } catch (err) {
            alert(err?.response?.data?.message || tv('actionFailed'));
        } finally { setSaving(false); }
    };

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} title={tv('tvTitle')} />
            <form onSubmit={submit} className="max-w-2xl mx-auto px-4 py-6 pb-24">
                <h2 className="text-white text-xl font-black text-center">{tv('tvCreateRoute').replace('+ ', '')}</h2>

                <label className={LABEL}>{tv('tvRouteName')} *</label>
                <input className={INPUT} value={title} onChange={e => setTitle(e.target.value)} placeholder={tv('tvRouteNamePh')} />

                <label className={LABEL}>{tv('tvStart')} *</label>
                <CityAutocomplete value={startPlace} onChange={setStartPlace} placeholder={tv('tvPlacePh')} className={INPUT} />

                <label className={LABEL}>{tv('tvEnd')}</label>
                <CityAutocomplete value={endPlace} onChange={setEndPlace} placeholder={tv('tvPlacePh')} className={INPUT} />

                <label className={LABEL}>{tv('tvStops')}</label>
                {stops.map((st, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2">
                        <input className={INPUT} value={st} placeholder={tv('tvStopPh')}
                            onChange={e => setStops(prev => prev.map((x, j) => (j === i ? e.target.value : x)))} />
                        <button type="button" onClick={() => setStops(prev => prev.filter((_, j) => j !== i))}
                            className="w-9 h-9 shrink-0 rounded-full bg-gray-800 text-white font-black">✕</button>
                    </div>
                ))}
                <button type="button" onClick={() => setStops(prev => [...prev, ''])} className="text-sky-400 font-bold text-sm py-1">{tv('tvAddStop')}</button>

                <div className="flex gap-3">
                    <div className="flex-1">
                        <label className={LABEL}>{tv('tvDistance')}</label>
                        <input className={INPUT} value={distanceKm} onChange={e => setDistanceKm(e.target.value)} inputMode="decimal" placeholder="12" />
                    </div>
                    <div className="flex-1">
                        <label className={LABEL}>{tv('tvDuration')}</label>
                        <input className={INPUT} value={durationText} onChange={e => setDurationText(e.target.value)} placeholder={tv('tvDurationPh')} />
                    </div>
                </div>

                <label className={LABEL}>{tv('tvDifficulty')}</label>
                <div className="flex gap-2">
                    {['EASY', 'MEDIUM', 'HARD'].map(k => (
                        <button type="button" key={k} className={chip(difficulty === k)} onClick={() => setDifficulty(difficulty === k ? null : k)}>{tv(`tvDiff${k}`)}</button>
                    ))}
                </div>

                <label className={LABEL}>{tv('tvMedia')}</label>
                <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={onFiles} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="w-full border border-dashed border-sky-500 rounded-xl py-3.5 text-sky-400 font-bold text-sm">
                    {uploading ? tv('tvUploading') : tv('tvAddMedia')}
                </button>
                <MediaStrip media={media} onRemove={(i) => setMedia(prev => prev.filter((_, j) => j !== i))} />

                <label className={LABEL}>{tv('tvExperience')}</label>
                <textarea className={`${INPUT} min-h-28`} value={experience} onChange={e => setExperience(e.target.value)} placeholder={tv('tvExperiencePh')} />

                <button type="submit" className={`${PRIMARY_BTN} mt-6`} disabled={saving || uploading}>
                    {saving ? '…' : tv('tvShare')}
                </button>
            </form>
        </div>
    );
}
