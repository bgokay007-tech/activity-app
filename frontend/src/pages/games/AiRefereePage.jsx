import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import api from '../../services/api';

const GREETING = `Hoş geldin! Ben bu masanın hem çayını demleyen hem de kurallarını bilen adamıyım — otuz senedir bu oyunları oynatırım, gözümden hiçbir yanlış el kaçmaz. Bugün ne oynuyoruz, karar senin:

**Okey tarafı:**
- Klasik Okey (4 kişilik, taş atma-çekme, çift/seri açma)
- 101 Okey (elden başlayıp 101 puana ulaşma, katlamalı/katlamasız)

**Batak tarafı:**
- İhaleli Batak (açık artırmayla el alma taahhüdü)
- Eşli Batak (2'ye 2 takım, karşılıklı oturma)
- Gömmeli Batak (bazı kartlar kapalı/gömülü kalır, daha zorlu versiyon)

Söyle bakalım: hangisini oynayacağız, ve masada kaç kişi olacağız?`;

function AiRefereePage() {
    const navigate = useNavigate();
    const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING }]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const bottomRef = useRef(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const send = async () => {
        const text = input.trim();
        if (!text || sending) return;
        setError('');
        const next = [...messages, { role: 'user', content: text }];
        setMessages(next);
        setInput('');
        setSending(true);
        try {
            const { data } = await api.post('/ai-referee/chat', { messages: next });
            setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        } catch (err) {
            setError(err?.response?.data?.message || 'Hakem şu anda cevap veremedi, tekrar dener misin?');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col">
            <Navbar onBack={() => navigate(-1)} title="🀄 AI Hakem — Okey & Batak" />
            <div className="flex-1 max-w-2xl w-full mx-auto flex flex-col px-4 py-4 min-h-0">
                <div className="flex-1 overflow-y-auto space-y-3 pb-3">
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-line ${
                                m.role === 'user'
                                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-br-sm'
                                    : 'bg-gray-800 text-gray-100 rounded-bl-sm border border-gray-700'
                            }`}>
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {sending && (
                        <div className="flex justify-start">
                            <div className="bg-gray-800 border border-gray-700 text-gray-400 px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm">
                                ☕ Hakem düşünüyor...
                            </div>
                        </div>
                    )}
                    {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                    <div ref={bottomRef} />
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-800 flex-shrink-0">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                        placeholder="Hamleni ya da sorunu yaz..."
                        disabled={sending}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                    />
                    <button
                        onClick={send}
                        disabled={sending || !input.trim()}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50 hover:opacity-90 transition"
                    >
                        Gönder
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AiRefereePage;
