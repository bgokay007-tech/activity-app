import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Navbar from '../../components/Navbar';
import { connectSocket, getSocket, onSocket } from '../../services/socket';

const COLOR_HEX = { R: '#dc2626', Y: '#ca8a04', B: '#2563eb', K: '#111827' };
function isJokerTile(t) { return t === 'J1' || t === 'J2'; }
function tileColorCode(t) { return t[0]; }
function tileNumLabel(t) { return t.slice(1); }

function OkeyTile({ tile, small, disabled, highlighted, rejected, onClick }) {
    const joker = isJokerTile(tile);
    const colorHex = joker ? '#b45309' : COLOR_HEX[tileColorCode(tile)];
    const sizeCls = small ? 'w-6 h-9' : 'w-10 h-14';
    return (
        <button onClick={onClick ? () => onClick(tile) : undefined}
            className={`${sizeCls} rounded-md flex items-center justify-center border-2 flex-shrink-0 transition shadow-sm ${rejected ? 'animate-[okeyShake_0.4s_ease-in-out]' : ''}`}
            style={{ backgroundColor: highlighted ? '#fff7e0' : '#fdf6e3', borderColor: rejected ? '#ef4444' : (highlighted ? '#f59e0b' : '#00000022'), opacity: disabled ? 0.45 : 1, cursor: onClick ? 'pointer' : 'default' }}>
            {joker ? <span className={small ? 'text-xs' : 'text-lg'}>🃏</span> : <span className={`font-black ${small ? 'text-[11px]' : 'text-lg'}`} style={{ color: colorHex }}>{tileNumLabel(tile)}</span>}
        </button>
    );
}
function TileBack({ small }) {
    const sizeCls = small ? 'w-6 h-9' : 'w-10 h-14';
    return <div className={`${sizeCls} rounded-md flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: '#1e3a8a', border: '1px solid #ffffff33' }}><span className="text-xs">🀫</span></div>;
}

function OkeyBoard({ tableId, myId, onExit }) {
    const [state, setState] = useState(null);
    const [hand, setHand] = useState([]);
    const [roundEnd, setRoundEnd] = useState(null);
    const [gameEnd, setGameEnd] = useState(null);
    const [declareMode, setDeclareMode] = useState(false);
    const [hint, setHint] = useState('');
    const hintTimerRef = useRef(null);
    const showHint = (msg) => {
        setHint(msg);
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => setHint(''), 2400);
    };
    useEffect(() => () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); }, []);
    // Geçersiz bir tıklamada taşın kendisini de kısaca kırmızı çerçeveyle titretiyoruz —
    // küçük bir metin uyarısı tek başına çoğu zaman fark edilmiyordu.
    const [rejectedTile, setRejectedTile] = useState(null);
    const rejectedTimerRef = useRef(null);
    const flashRejected = (tile) => {
        setRejectedTile(tile);
        if (rejectedTimerRef.current) clearTimeout(rejectedTimerRef.current);
        rejectedTimerRef.current = setTimeout(() => setRejectedTile(null), 450);
    };
    useEffect(() => () => { if (rejectedTimerRef.current) clearTimeout(rejectedTimerRef.current); }, []);

    useEffect(() => {
        getSocket()?.emit('okey:getState', { tableId });
        const offState = onSocket('okey:state', (data) => { if (data.tableId === tableId) { setState(data); if (data.phase !== 'roundEnd') setRoundEnd(null); } });
        const offHand = onSocket('okey:hand', (data) => setHand(data.hand || []));
        const offRoundEnd = onSocket('okey:roundEnd', (data) => setRoundEnd(data));
        const offGameEnd = onSocket('okey:gameEnd', (data) => setGameEnd(data));
        const offErr = onSocket('okey:error', (data) => alert(data?.message || 'Bir hata oluştu.'));
        return () => { offState(); offHand(); offRoundEnd(); offGameEnd(); offErr(); };
    }, [tableId]);

    useEffect(() => {
        const leave = () => getSocket()?.emit('okey:leaveTable', { tableId });
        return leave;
    }, [tableId]);

    if (!state) return <p className="text-gray-500 text-sm text-center py-16">Masaya bağlanılıyor...</p>;

    const mySeatInfo = state.seats.find(seat => seat.userId === myId);
    const mySeat = mySeatInfo ? mySeatInfo.seat : 0;
    const order = [mySeat, (mySeat + 1) % 4, (mySeat + 2) % 4, (mySeat + 3) % 4];
    const [, leftSeat, topSeat, rightSeat] = order;
    const seatByIdx = (seat) => state.seats.find(x => x.seat === seat) || {};
    const isMyTurn = state.turn === mySeat;
    const canDraw = state.phase === 'playing' && isMyTurn && !state.awaitingDiscard;
    const canAct = state.phase === 'playing' && isMyTurn && state.awaitingDiscard;
    const isHighlighted = (tile) => isJokerTile(tile) || (tileColorCode(tile) === state.okeyColor && Number(tileNumLabel(tile)) === state.okeyNumber);

    const notYourTurnMsg = () => (!isMyTurn ? 'Sıra sende değil' : (state.awaitingDiscard ? 'Önce taşını atmalısın' : 'Önce taş çekmelisin'));
    const drawFromDeck = () => {
        if (!canDraw) return showHint(notYourTurnMsg());
        getSocket()?.emit('okey:drawTile', { tableId, source: 'deck' });
    };
    const drawFromDiscard = () => {
        if (!canDraw) return showHint(notYourTurnMsg());
        if (!state.discardTop) return showHint('Atım yığını boş');
        getSocket()?.emit('okey:drawTile', { tableId, source: 'discard' });
    };
    const onTileClick = (tile) => {
        if (!canAct) { flashRejected(tile); return showHint(notYourTurnMsg()); }
        if (declareMode) {
            if (confirm('Bu taşı atarak elini açmak istediğine emin misin?')) getSocket()?.emit('okey:declareWin', { tableId, tile });
            setDeclareMode(false);
        } else {
            getSocket()?.emit('okey:discardTile', { tableId, tile });
        }
    };
    const goBack = () => { getSocket()?.emit('okey:leaveTable', { tableId }); onExit(); };

    return (
        <div className="max-w-3xl mx-auto">
            <style>{`@keyframes okeyShake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }`}</style>
            <div className="flex items-center justify-between mb-2">
                <button onClick={goBack} className="text-white text-sm">‹ Ayrıl</button>
                <p className="text-white text-sm font-bold">El {state.roundNumber}/{state.totalRounds}</p>
                {state.indicator ? (
                    <div className="bg-white/90 rounded-lg px-2 py-1 flex flex-col items-center gap-0.5">
                        <span className="text-[9px] font-black text-gray-900">Gösterge</span>
                        <OkeyTile tile={state.indicator} small />
                    </div>
                ) : <div className="w-16" />}
            </div>

            <div className="flex gap-1.5 mb-3">
                {state.seats.map(seat => (
                    <div key={seat.seat} className="flex-1 rounded-lg py-1 text-center border transition"
                        style={seat.seat === state.turn ? { backgroundColor: '#fbbf2433', borderColor: '#fbbf24' } : { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'transparent' }}>
                        <p className="text-[10px] font-bold truncate" style={{ color: seat.seat === state.turn ? '#fde047' : '#fff' }}>
                            {seat.userId === myId ? 'Sen' : seat.username}{seat.seat === state.dealerIndex ? ' 🎯' : ''}{!seat.connected ? ' 🤖' : ''}
                        </p>
                        <p className="text-green-400 text-sm font-black" style={{ color: state.scores[seat.seat] < 0 ? '#f87171' : '#4ade80' }}>{state.scores[seat.seat]}</p>
                    </div>
                ))}
            </div>

            <div className="rounded-2xl p-3" style={{ backgroundColor: '#0b3d1f', minHeight: 320 }}>
                <div className="flex flex-col items-center gap-1 mb-2">
                    <p className="text-xs font-bold truncate max-w-[140px]" style={{ color: topSeat === state.turn ? '#fde047' : '#fff' }}>{seatByIdx(topSeat).username}</p>
                    <div className="flex flex-wrap justify-center gap-0.5 max-w-xs">
                        {Array.from({ length: Math.min(seatByIdx(topSeat).handCount || 0, 7) }).map((_, i) => <TileBack key={i} small />)}
                    </div>
                </div>
                <div className="flex items-center justify-between" style={{ minHeight: 100 }}>
                    <div className="flex flex-col items-center gap-1 w-20">
                        <p className="text-[11px] font-bold truncate max-w-[70px]" style={{ color: leftSeat === state.turn ? '#fde047' : '#fff' }}>{seatByIdx(leftSeat).username}</p>
                        <div className="flex flex-wrap justify-center gap-0.5">
                            {Array.from({ length: Math.min(seatByIdx(leftSeat).handCount || 0, 7) }).map((_, i) => <TileBack key={i} small />)}
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={drawFromDeck} className="flex flex-col items-center transition" style={{ opacity: canDraw ? 1 : 0.5, cursor: 'pointer' }}>
                            <span className="text-3xl">🀫</span>
                            <span className="text-white text-[11px] font-bold mt-0.5">{state.deckCount}</span>
                        </button>
                        <div style={{ opacity: canDraw && state.discardTop ? 1 : 0.5 }}>
                            {state.discardTop
                                ? <OkeyTile tile={state.discardTop} highlighted={isHighlighted(state.discardTop)} onClick={drawFromDiscard} />
                                : <button onClick={drawFromDiscard} className="text-white/30 text-2xl" style={{ cursor: 'pointer' }}>—</button>}
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-1 w-20">
                        <p className="text-[11px] font-bold truncate max-w-[70px]" style={{ color: rightSeat === state.turn ? '#fde047' : '#fff' }}>{seatByIdx(rightSeat).username}</p>
                        <div className="flex flex-wrap justify-center gap-0.5">
                            {Array.from({ length: Math.min(seatByIdx(rightSeat).handCount || 0, 7) }).map((_, i) => <TileBack key={i} small />)}
                        </div>
                    </div>
                </div>
            </div>

            <div className={`text-center mt-2 rounded-xl py-2 transition ${isMyTurn ? 'bg-amber-500/20' : ''}`}>
                <p className={isMyTurn ? 'text-amber-300 font-black' : 'text-amber-300/80 text-xs font-bold'} style={isMyTurn ? { fontSize: '1rem' } : undefined}>
                    {isMyTurn ? (canDraw ? 'Sıra sende — bir taş çek' : 'Sıra sende — bir taş at ya da elini aç') : `${seatByIdx(state.turn).username || ''} oynuyor...`}
                </p>
                {hint && <p className="text-red-400 text-sm font-black mt-1 bg-red-500/10 rounded-lg py-1 mx-3">⚠️ {hint}</p>}
            </div>

            <div className="flex flex-col items-center mt-3">
                <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
                    {hand.map((tile, i) => (
                        <OkeyTile key={`${tile}_${i}`} tile={tile} highlighted={isHighlighted(tile)} disabled={!canAct} rejected={rejectedTile === tile} onClick={onTileClick} />
                    ))}
                </div>
                {canAct && (
                    <button onClick={() => setDeclareMode(v => !v)}
                        className={`mt-2 text-xs font-bold px-3 py-1.5 rounded-lg border transition ${declareMode ? 'bg-amber-500 border-amber-400 text-black' : 'bg-white/10 border-white/20 text-amber-300'}`}>
                        {declareMode ? '✓ Elini aç modu — bir taş seç' : '🏆 Elini Aç'}
                    </button>
                )}
                <p className="text-white/50 text-[10px] mt-1">Tıkla: at (veya elini aç modundaysan aç)</p>
            </div>

            {roundEnd && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 rounded-2xl p-6 w-80">
                        <p className="text-white font-black text-lg text-center mb-3">{roundEnd.draw ? 'El Yandı' : 'El Bitti'}</p>
                        {roundEnd.draw ? (
                            <p className="text-gray-400 text-sm text-center">Deste bitti, kimse açamadı.</p>
                        ) : (
                            <>
                                <p className="text-gray-300 text-sm text-center mb-2">{seatByIdx(roundEnd.winner).username} {roundEnd.ciftOkey ? '(Çift Okey!) ' : ''}kazandı</p>
                                {state.seats.map(seat => (
                                    <p key={seat.seat} className="text-gray-400 text-xs text-center">
                                        {seat.userId === myId ? 'Sen' : seat.username}: {roundEnd.delta[seat.seat] >= 0 ? '+' : ''}{roundEnd.delta[seat.seat]} → {roundEnd.scores[seat.seat]}
                                    </p>
                                ))}
                            </>
                        )}
                        <p className="text-gray-500 text-[11px] text-center mt-3">Yeni el birazdan başlıyor...</p>
                    </div>
                </div>
            )}

            {gameEnd && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 rounded-2xl p-6 w-80">
                        <p className="text-white font-black text-lg text-center mb-3">🏆 Oyun Bitti</p>
                        {state.seats.map(seat => ({ seat, score: gameEnd.scores[seat.seat] }))
                            .sort((a, b) => b.score - a.score)
                            .map(({ seat, score }, i) => (
                                <p key={seat.seat} className="text-gray-300 text-sm text-center">
                                    {i === 0 ? '🥇 ' : `${i + 1}. `}{seat.userId === myId ? 'Sen' : seat.username}: {score}
                                </p>
                            ))}
                        <button onClick={goBack} className="w-full bg-purple-600 text-white font-bold py-2.5 rounded-xl mt-4">Geri Dön</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function OkeyLobby({ myName, onMatched }) {
    const [searching, setSearching] = useState(false);
    const [queuePos, setQueuePos] = useState(null);
    const [difficulty, setDifficulty] = useState('medium');
    const navigatedRef = useRef(false);

    useEffect(() => { getSocket()?.emit('okey:setUsername', myName); }, [myName]);

    useEffect(() => {
        const offQueued = onSocket('okey:queued', (data) => setQueuePos(data.position));
        const offMatched = onSocket('okey:matched', (data) => {
            if (navigatedRef.current) return;
            navigatedRef.current = true;
            setSearching(false);
            onMatched(data.tableId);
        });
        const offErr = onSocket('okey:error', (data) => { setSearching(false); alert(data?.message || 'Bir hata oluştu.'); });
        return () => { offQueued(); offMatched(); offErr(); };
    }, [onMatched]);

    const startSearch = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        setSearching(true); setQueuePos(null);
        socket.emit('okey:findMatch');
    };
    const cancelSearch = () => { getSocket()?.emit('okey:cancelFindMatch'); setSearching(false); setQueuePos(null); };
    const startVsBots = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('okey:playVsBots', { difficulty });
    };

    return (
        <div className="max-w-md mx-auto">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center mb-4">
                <p className="text-5xl mb-3">🀄</p>
                {searching ? (
                    <>
                        <p className="text-white font-bold mb-3">Rakip aranıyor{queuePos ? ` (${queuePos}/4)` : ''}...</p>
                        <button onClick={cancelSearch} className="bg-gray-800 border border-gray-700 text-gray-300 font-bold px-4 py-2 rounded-xl text-sm">Vazgeç</button>
                    </>
                ) : (
                    <button onClick={startSearch} className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 rounded-xl">
                        🎯 Rakip Bul (4 kişilik)
                    </button>
                )}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <p className="text-gray-400 text-xs font-bold mb-2">🤖 Botlara Karşı Oyna</p>
                <div className="flex gap-2 mb-3">
                    {[['easy', 'Kolay'], ['medium', 'Orta'], ['hard', 'Zor']].map(([k, l]) => (
                        <button key={k} onClick={() => setDifficulty(k)}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold border transition ${difficulty === k ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                            {l}
                        </button>
                    ))}
                </div>
                <button onClick={startVsBots} className="w-full bg-gray-800 border border-gray-700 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-gray-700 transition">
                    Botlara Karşı Başla
                </button>
            </div>
        </div>
    );
}

function OkeyPage() {
    const navigate = useNavigate();
    const user = useSelector(s => s.auth.user);
    // Sayfa yenilenince redux'taki user null kalıyor (login akışı dışında hiçbir yer
    // rehydrate etmiyor) — token'dan doğrudan userId çözülüyor, sayfa yenilense de çalışsın diye.
    const myId = (() => {
        try {
            const token = localStorage.getItem('activity_token');
            if (!token) return user?.id || null;
            return JSON.parse(atob(token.split('.')[1])).userId || user?.id || null;
        } catch { return user?.id || null; }
    })();
    const [tableId, setTableId] = useState(null);

    useEffect(() => { if (myId) connectSocket(myId); }, [myId]);

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} title="Okey" />
            <div className="px-4 py-6">
                {tableId
                    ? <OkeyBoard tableId={tableId} myId={myId} onExit={() => setTableId(null)} />
                    : <OkeyLobby myName={user?.fullName || user?.username || 'Oyuncu'} onMatched={setTableId} />}
            </div>
        </div>
    );
}

export default OkeyPage;
