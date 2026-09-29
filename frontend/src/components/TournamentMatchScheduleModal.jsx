import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

const WEEKDAYS = [
    { key: 1, tr: 'Pzt', en: 'Mon', ru: 'Пн', de: 'Mo' },
    { key: 2, tr: 'Sal', en: 'Tue', ru: 'Вт', de: 'Di' },
    { key: 3, tr: 'Çar', en: 'Wed', ru: 'Ср', de: 'Mi' },
    { key: 4, tr: 'Per', en: 'Thu', ru: 'Чт', de: 'Do' },
    { key: 5, tr: 'Cum', en: 'Fri', ru: 'Пт', de: 'Fr' },
    { key: 6, tr: 'Cmt', en: 'Sat', ru: 'Сб', de: 'Sa' },
    { key: 7, tr: 'Paz', en: 'Sun', ru: 'Вс', de: 'So' },
];

const dayLabel = (weekday, lang) => {
    const d = WEEKDAYS.find(x => x.key === weekday);
    return d ? (d[lang] || d.en) : String(weekday);
};

const formatSlot = (slot, lang) => {
    if (!slot) return '';
    const day = slot.date || (slot.weekday != null ? dayLabel(slot.weekday, lang) : '');
    return `${day} ${slot.timeFrom || ''}-${slot.timeTo || ''}`.trim();
};

export const formatAgreed = (agreed) => {
    if (!agreed) return '';
    return [agreed.date, `${agreed.timeFrom || ''}-${agreed.timeTo || ''}`, agreed.venueName].filter(Boolean).join(' · ');
};

// Eski kayıtlarda "oyuncular ortaklaşa karar verir" metni location'a yazılmış olabiliyor —
// o durumda sabit kort yok, oyuncular teklifte kort/mekan adı da yazar.
export const hasTournSpecificCourt = (tournament) => {
    const loc = String(tournament?.location || '').trim();
    if (!loc) return false;
    return !/ortaklaşa|oyuncular|players decide|gemeinsam|соглас/i.test(loc);
};

const EMPTY_SCHEDULE = { availability: { p1: [], p2: [] }, proposals: [], agreed: null };

/**
 * Turnuva maçı yer/zaman: eşleşen taraflar müsaitlik girer, teklif gönderir, rakip teklifini kabul eder;
 * diğerleri yalnızca anlaşılmış yer/zamanı görür.
 */
export default function TournamentMatchScheduleModal({ tournament, match, mySide, onClose, onUpdated }) {
    const { t, i18n } = useTranslation();
    const m = (k) => t(`tmatch.${k}`);
    const lang = (i18n.language || 'en').slice(0, 2);
    const playersArrangeCourts = !hasTournSpecificCourt(tournament);
    const [schedule, setSchedule] = useState(EMPTY_SCHEDULE);
    const [saving, setSaving] = useState(false);
    const [mySlots, setMySlots] = useState([]);
    const [propDate, setPropDate] = useState('');
    const [propFrom, setPropFrom] = useState('10:00');
    const [propTo, setPropTo] = useState('12:00');
    const [propVenue, setPropVenue] = useState('');

    useEffect(() => {
        if (!match) return;
        const s = match.scheduleData && typeof match.scheduleData === 'object' ? match.scheduleData : EMPTY_SCHEDULE;
        setSchedule(s);
        setMySlots(mySide && Array.isArray(s.availability?.[mySide]) ? s.availability[mySide] : []);
    }, [match, mySide]);

    if (!match) return null;

    const oppSide = mySide === 'p1' ? 'p2' : mySide === 'p2' ? 'p1' : null;
    const canAct = !!mySide && match.status === 'PENDING' && match.p1Id && match.p2Id;
    const agreedText = formatAgreed(schedule?.agreed);
    const oppSlots = oppSide ? (schedule?.availability?.[oppSide] || []) : [];
    const proposals = Array.isArray(schedule?.proposals) ? schedule.proposals : [];
    const base = `/tournaments/${tournament.id}/matches/${match.id}`;

    const run = async (fn, okKey) => {
        setSaving(true);
        try {
            const { data } = await fn();
            setSchedule(data.scheduleData);
            onUpdated?.(data.scheduleData);
            if (okKey) alert(m(okKey));
            return true;
        } catch (e) {
            alert(e?.response?.data?.message || m('actionFailed'));
            return false;
        } finally { setSaving(false); }
    };

    const toggleWeekday = (weekday) => setMySlots(prev => prev.some(s => s.weekday === weekday)
        ? prev.filter(s => s.weekday !== weekday)
        : [...prev, { weekday, timeFrom: '09:00', timeTo: '21:00' }]);
    const updateSlotTime = (weekday, field, value) =>
        setMySlots(prev => prev.map(s => s.weekday === weekday ? { ...s, [field]: value } : s));

    const saveAvailability = () => run(() => api.patch(`${base}/availability`, { slots: mySlots }), 'tournSchedAvailSaved');

    const submitProposal = async () => {
        if (!propDate || !propFrom || !propTo) { alert(m('tournSchedNeedDateTime')); return; }
        if (playersArrangeCourts && !propVenue.trim()) { alert(m('tournSchedNeedVenue')); return; }
        const ok = await run(() => api.post(`${base}/schedule-propose`, {
            date: propDate, timeFrom: propFrom, timeTo: propTo,
            venueName: playersArrangeCourts ? propVenue.trim() : undefined,
        }), 'tournSchedProposed');
        if (ok) setPropVenue('');
    };

    const agreeProposal = (proposalId) => run(() => api.post(`${base}/schedule-agree`, { proposalId }), 'tournSchedAgreedOk');

    const INPUT = 'bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500';
    const H = 'text-gray-200 text-xs font-black mb-1.5';

    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
                    <h3 className="text-white font-black text-sm flex-1">{match.p1Name || 'TBD'} vs {match.p2Name || 'TBD'}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                </div>

                <div className="overflow-y-auto p-4 space-y-4">
                    <div className={`rounded-xl p-3 border ${agreedText ? 'bg-green-600/10 border-green-600/40' : 'bg-gray-900 border-gray-800'}`}>
                        <p className={`text-[11px] font-black mb-1 ${agreedText ? 'text-green-400' : 'text-gray-500'}`}>{m('tournSchedAgreedTitle')}</p>
                        <p className="text-white text-sm font-bold">{agreedText || m('tournSchedAgreedEmpty')}</p>
                        {tournament?.location && !playersArrangeCourts && (
                            <p className="text-gray-500 text-[11px] mt-1">{m('tournSchedFixedVenue')}: {tournament.location}</p>
                        )}
                    </div>

                    {!canAct && !agreedText && <p className="text-gray-500 text-xs">{m('tournSchedSpectatorHint')}</p>}

                    {canAct && (
                        <>
                            <div>
                                <p className={H}>{m('tournSchedOppAvail')}</p>
                                {oppSlots.length === 0
                                    ? <p className="text-gray-500 text-[11px]">{m('tournSchedOppEmpty')}</p>
                                    : oppSlots.map((s, i) => <p key={i} className="text-gray-400 text-xs">· {formatSlot(s, lang)}</p>)}
                            </div>

                            <div>
                                <p className={H}>{m('tournSchedMyAvail')}</p>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {WEEKDAYS.map(d => {
                                        const active = mySlots.some(s => s.weekday === d.key);
                                        return (
                                            <button key={d.key} onClick={() => toggleWeekday(d.key)}
                                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${active ? 'bg-sky-500 border-sky-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                                                {dayLabel(d.key, lang)}
                                            </button>
                                        );
                                    })}
                                </div>
                                {mySlots.filter(s => s.weekday != null).map(s => (
                                    <div key={s.weekday} className="flex items-center gap-2 mb-1.5">
                                        <span className="text-gray-400 text-[11px] font-bold w-9">{dayLabel(s.weekday, lang)}</span>
                                        <input type="time" value={s.timeFrom} onChange={e => updateSlotTime(s.weekday, 'timeFrom', e.target.value)} className={`${INPUT} flex-1 py-1.5`} />
                                        <input type="time" value={s.timeTo} onChange={e => updateSlotTime(s.weekday, 'timeTo', e.target.value)} className={`${INPUT} flex-1 py-1.5`} />
                                    </div>
                                ))}
                                <button onClick={saveAvailability} disabled={saving}
                                    className="w-full mt-1 bg-sky-500/15 border border-sky-500/50 text-sky-300 text-sm font-black py-2.5 rounded-xl disabled:opacity-50">
                                    {m('tournSchedSaveAvail')}
                                </button>
                            </div>

                            <div className="space-y-1.5">
                                <p className={H}>{m('tournSchedProposeTitle')}</p>
                                {playersArrangeCourts && (
                                    <input value={propVenue} onChange={e => setPropVenue(e.target.value)} placeholder={m('tournSchedVenuePh')} className={`${INPUT} w-full`} />
                                )}
                                <input type="date" value={propDate} onChange={e => setPropDate(e.target.value)} className={`${INPUT} w-full`} />
                                <div className="flex gap-2">
                                    <input type="time" value={propFrom} onChange={e => setPropFrom(e.target.value)} className={`${INPUT} flex-1`} />
                                    <input type="time" value={propTo} onChange={e => setPropTo(e.target.value)} className={`${INPUT} flex-1`} />
                                </div>
                                <button onClick={submitProposal} disabled={saving}
                                    className="w-full bg-purple-600/15 border border-purple-500/50 text-purple-300 text-sm font-black py-2.5 rounded-xl disabled:opacity-50">
                                    {m('tournSchedSendPropose')}
                                </button>
                            </div>

                            <div>
                                <p className={H}>{m('tournSchedProposals')}</p>
                                {proposals.length === 0 ? (
                                    <p className="text-gray-500 text-[11px]">{m('tournSchedNoProposals')}</p>
                                ) : (
                                    <div className="space-y-2">
                                        {proposals.slice().reverse().map(p => {
                                            const mine = p.side === mySide;
                                            return (
                                                <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                                                    <p className="text-white text-xs font-bold">{[p.date, `${p.timeFrom}-${p.timeTo}`, p.venueName].filter(Boolean).join(' · ')}</p>
                                                    <p className="text-gray-500 text-[10px] mt-0.5">{mine ? m('tournSchedYourProposal') : m('tournSchedOppProposal')}</p>
                                                    {!mine && (
                                                        <button onClick={() => agreeProposal(p.id)} disabled={saving}
                                                            className="w-full mt-2 bg-green-600/20 border border-green-600/40 text-green-400 text-xs font-black py-2 rounded-lg disabled:opacity-50">
                                                            {m('tournSchedAgreeBtn')}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
