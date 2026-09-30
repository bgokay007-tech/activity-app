import { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { setLang } from '../store/slices/langSlice';
import { LANGUAGES } from '../config/visualCatalog';

// Eski döngülü "EN → TR" butonu kaç dil olduğunu göstermiyordu — bütün diller listelenir.
// inline: giriş/kayıt ekranında dört dil yan yana; aksi halde navbar açılır listesi.
// Bayrak emojisi yerine dil kodu — Windows Chrome bayrakları çizmiyor, "TR TR" görünüyordu.
export default function LanguageSwitcher({ inline = false }) {
    const dispatch = useDispatch();
    const lang = useSelector(state => state.lang.lang);
    const { t, i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const choose = (code) => {
        dispatch(setLang(code));
        i18n.changeLanguage(code);
        setOpen(false);
    };

    if (inline) {
        return (
            <div className="flex flex-wrap justify-center gap-2">
                {LANGUAGES.map(l => (
                    <button
                        key={l.code}
                        type="button"
                        onClick={() => choose(l.code)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition ${lang === l.code ? 'bg-lime-400/15 border-lime-400 text-lime-300' : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}
                    >
                        <span className="text-[10px] font-black uppercase opacity-70">{l.code}</span>
                        {l.name}
                    </button>
                ))}
            </div>
        );
    }

    const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[1];
    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(v => !v)}
                title={t('nav.language')}
                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
            >
                <span className="text-sm leading-none">🌐</span>
                <span className="uppercase">{current.code}</span>
                <span className="text-gray-500 text-[10px]">▾</span>
            </button>
            {open && (
                <div className="absolute right-0 top-10 w-48 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-4 pt-3 pb-1 text-gray-500 text-[10px] font-black uppercase tracking-wider">
                        🌐 {t('nav.language')} · {LANGUAGES.length}
                    </div>
                    {LANGUAGES.map(l => (
                        <button
                            key={l.code}
                            onClick={() => choose(l.code)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition text-left ${lang === l.code ? 'bg-lime-400/10' : ''}`}
                        >
                            <span className={`w-7 text-center text-[10px] font-black rounded-md py-0.5 uppercase ${lang === l.code ? 'bg-lime-400/20 text-lime-300' : 'bg-gray-800 text-gray-400'}`}>{l.code}</span>
                            <span className={`flex-1 text-sm font-bold ${lang === l.code ? 'text-lime-300' : 'text-gray-300'}`}>{l.name}</span>
                            {lang === l.code && <span className="text-lime-300 text-sm">✓</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
