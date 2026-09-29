import api from '../../services/api';

export const INPUT = 'w-full bg-gray-900 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-sky-500 text-sm';
export const LABEL = 'block text-gray-400 text-sm font-bold mt-4 mb-1.5';
export const PRIMARY_BTN = 'w-full bg-sky-500 hover:bg-sky-600 text-white font-black py-3 rounded-2xl transition disabled:opacity-60';
export const chip = (active) => `px-3 py-1.5 rounded-full border text-xs font-bold transition ${active ? 'border-sky-500 bg-sky-500/15 text-sky-400' : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'}`;

const pad2 = (n) => String(n).padStart(2, '0');

export function formatTripDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export async function uploadFile(file) {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return { url: data.url, type: data.type === 'video' ? 'video' : data.type === 'pdf' ? 'pdf' : 'image' };
}

export async function uploadFiles(fileList, limit = 10) {
    const out = [];
    for (const f of Array.from(fileList || []).slice(0, limit)) out.push(await uploadFile(f));
    return out;
}

export function MediaStrip({ media, onRemove, onOpen }) {
    if (!media?.length) return null;
    return (
        <div className="flex gap-2 overflow-x-auto mt-3 pb-1">
            {media.map((m, i) => (
                <div key={`${m.url}-${i}`} className="relative shrink-0">
                    <button type="button" onClick={() => onOpen?.(m)} className="block">
                        {m.type === 'image'
                            ? <img src={m.url} alt="" className="w-24 h-24 rounded-xl object-cover" />
                            : <div className="w-24 h-24 rounded-xl bg-gray-800 flex items-center justify-center text-3xl">🎬</div>}
                    </button>
                    {onRemove && (
                        <button type="button" onClick={() => onRemove(i)}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs font-black">✕</button>
                    )}
                </div>
            ))}
        </div>
    );
}

export function Stars({ value, onChange, size = 'text-3xl' }) {
    return (
        <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)}
                    className={`${size} ${n <= value ? 'text-yellow-400' : 'text-gray-700'} ${onChange ? 'hover:scale-110 transition' : 'cursor-default'}`}>★</button>
            ))}
        </div>
    );
}

export function Stepper({ value, onChange, min = 1, max = 8 }) {
    const btn = 'w-10 h-10 rounded-full bg-gray-800 border border-gray-700 text-white text-xl font-black hover:bg-gray-700';
    return (
        <div className="flex items-center gap-4">
            <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
            <span className="text-white text-xl font-black min-w-6 text-center">{value}</span>
            <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
        </div>
    );
}
