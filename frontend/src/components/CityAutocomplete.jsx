import { useState, useRef } from 'react';
import api from '../services/api';

// Mobildeki CityAutocomplete'in web ikizi. Öneriye mousedown'da seçiliyor — onClick'te
// input blur olup liste kapandığı için ilk tıklama boşa gidiyordu.
export default function CityAutocomplete({ value, onChange, onSelect, placeholder, className = '', dropUp = false }) {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const timer = useRef(null);

    const search = (text) => {
        onChange(text);
        setResults([]);
        if (text.length < 2) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const { data } = await api.get('/cities', { params: { q: text } });
                setResults(Array.isArray(data) ? data : []);
                setOpen(true);
            } catch { setResults([]); }
            finally { setLoading(false); }
        }, 300);
    };

    const select = (city) => {
        const label = city.district ? `${city.district}, ${city.province}` : city.province;
        onChange(label);
        onSelect?.(city);
        setResults([]);
        setOpen(false);
    };

    return (
        <div className="relative">
            <input
                value={value}
                onChange={e => search(e.target.value)}
                onFocus={() => results.length && setOpen(true)}
                onBlur={() => setOpen(false)}
                placeholder={placeholder}
                className={className}
            />
            {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">…</span>}
            {open && results.length > 0 && (
                <div className={`absolute left-0 right-0 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                    {results.map((c, i) => (
                        <button
                            key={c.id || i}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); select(c); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800 border-b border-gray-800 last:border-0"
                        >
                            {c.district
                                ? <><span className="text-white">{c.district}</span><span className="text-gray-500">, {c.province}</span></>
                                : <span className="text-white">{c.province}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
