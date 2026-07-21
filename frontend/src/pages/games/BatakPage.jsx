import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Navbar from '../../components/Navbar';
import { connectSocket, getSocket, onSocket } from '../../services/socket';

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR = { S: '#111827', C: '#111827', H: '#dc2626', D: '#dc2626' };
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

function rankLabel(card) { const rank = parseInt(card.slice(0, -1), 10); return RANK_LABEL[rank] || String(rank); }
function cardSuit(card) { return card.slice(-1); }

function PlayingCard({ card, small, disabled, onClick }) {
    const suit = cardSuit(card);
    const sizeCls = small ? 'w-8 h-11' : 'w-12 h-16';
    return (
        <button onClick={onClick ? () => onClick(card) : undefined}
            className={`${sizeCls} bg-white rounded-md flex flex-col items-center justify-center border flex-shrink-0 transition shadow-sm`}
            style={{ borderColor: '#00000022', opacity: disabled ? 0.4 : 1, cursor: onClick ? 'pointer' : 'default' }}>
            <span className={`font-black leading-none ${small ? 'text-[10px]' : 'text-sm'}`} style={{ color: SUIT_COLOR[suit] }}>{rankLabel(card)}</span>
            <span className={`font-black leading-none ${small ? 'text-xs' : 'text-lg'}`} style={{ color: SUIT_COLOR[suit] }}>{SUIT_SYMBOL[suit]}</span>
        </button>
    );
}
function CardBack({ small }) {
    const sizeCls = small ? 'w-8 h-11' : 'w-12 h-16';
    return <div className={`${sizeCls} rounded-md flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: '#1e3a8a', border: '1px solid #ffffff33' }}><span className="text-sm">🃏</span></div>;
}

function BatakBoard({ tableId, myId, onExit }) {
    const [state, setState] = useState(null);
    const [hand, setHand] = useState([]);
    const [roundEnd, setRoundEnd] = useState(null);
    const [gameEnd, setGameEnd] = useState(null);
    const [hint, setHint] = useState('');
    const hintTimerRef = useRef(null);
    const showHint = (msg) => {
        setHint(msg);
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => setHint(''), 1600);
    };
    useEffect(() => () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); }, []);

    useEffect(() => {
        getSocket()?.emit('batak:getState', { tableId });
        const offState = onSocket('batak:state', (data) => { if (data.tableId === tableId) { setState(data); if (data.phase !== 'roundEnd') setRoundEnd(null); } });
        const offHand = onSocket('batak:hand', (data) => setHand(data.hand || []));
        const offRoundEnd = onSocket('batak:roundEnd', (data) => setRoundEnd(data));
        const offGameEnd = onSocket('batak:gameEnd', (data) => setGameEnd(data));
        const offErr = onSocket('batak:error', (data) => alert(data?.message || 'Bir hata oluştu.'));
        return () => { offState(); offHand(); offRoundEnd(); offGameEnd(); offErr(); };
    }, [tableId]);

    useEffect(() => {
        const leave = () => getSocket()?.emit('batak:leaveTable', { tableId });
        return leave;
    }, [tableId]);

    const leadSuit = state?.leadSuit;
    const legalCards = useMemo(() => {
        if (!leadSuit) return hand;
        const follow = hand.filter(c => cardSuit(c) === leadSuit);
        return follow.length > 0 ? follow : hand;
    }, [hand, leadSuit]);

    if (!state) return <p className="text-gray-500 text-sm text-center py-16">Masaya bağlanılıyor...</p>;

    const mySeatInfo = state.seats.find(seat => seat.userId === myId);
    const mySeat = mySeatInfo ? mySeatInfo.seat : 0;
    const order = [mySeat, (mySeat + 1) % 4, (mySeat + 2) % 4, (mySeat + 3) % 4];
    const [bottomSeat, leftSeat, topSeat, rightSeat] = order;
    const seatByIdx = (seat) => state.seats.find(x => x.seat === seat) || {};
    const isMyTurn = state.turn === mySeat;
    // publicState yalnızca 'bidding'/'playing' fazlarında `turn` alanını dolduruyor;
    // 'choosingTrump' fazında sırası gelen highestBidder'dır — koltuk vurgusu için
    // üç fazı da kapsayan ayrı bir "aktif koltuk" hesaplanıyor.
    const activeSeat = state.phase === 'choosingTrump' ? state.highestBidder : state.turn;
    const trickCardFor = (seat) => (state.trick || []).find(x => x.seat === seat)?.card || null;

    const placeBid = (bid) => getSocket()?.emit('batak:placeBid', { tableId, bid });
    const chooseTrump = (suit) => getSocket()?.emit('batak:chooseTrump', { tableId, suit });
    const playCard = (card) => {
        if (state.phase !== 'playing') return showHint('Henüz kart oynama sırası değil');
        if (!isMyTurn) return showHint('Sıra sende değil');
        if (!legalCards.includes(card)) return showHint('Renge uymak zorundasın.');
        getSocket()?.emit('batak:playCard', { tableId, card });
    };
    const goBack = () => { getSocket()?.emit('batak:leaveTable', { tableId }); onExit(); };
    const bidOptions = Array.from({ length: 13 - state.highestBid }, (_, i) => state.highestBid + 1 + i);

    return (
        <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
                <button onClick={goBack} className="text-white text-sm">‹ Ayrıl</button>
                <p className="text-white text-sm font-bold">El {state.roundNumber}/{state.totalRounds}</p>
                {state.trumpSuit ? (
                    <div className="bg-white/90 rounded-lg px-2.5 py-1">
                        <span className="font-black text-sm" style={{ color: SUIT_COLOR[state.trumpSuit] }}>Koz: {SUIT_SYMBOL[state.trumpSuit]}</span>
                    </div>
                ) : <div className="w-16" />}
            </div>

            <div className="flex gap-1.5 mb-3">
                {state.seats.map(seat => (
                    <div key={seat.seat} className="flex-1 rounded-lg py-1 text-center border transition"
                        style={seat.seat === activeSeat ? { backgroundColor: '#fbbf2433', borderColor: '#fbbf24' } : { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'transparent' }}>
                        <p className="text-[10px] font-bold truncate" style={{ color: seat.seat === activeSeat ? '#fde047' : '#fff' }}>
                            {seat.userId === myId ? 'Sen' : seat.username}{seat.seat === state.dealerIndex ? ' 🎯' : ''}{!seat.connected ? ' 🤖' : ''}
                        </p>
                        <p className="text-sm font-black" style={{ color: state.scores[seat.seat] < 0 ? '#f87171' : '#4ade80' }}>{state.scores[seat.seat]}</p>
                    </div>
                ))}
            </div>

            <div className="rounded-2xl p-3" style={{ backgroundColor: '#0b3d1f', minHeight: 320 }}>
                <div className="flex flex-col items-center gap-1 mb-2">
                    <p className="text-xs font-bold truncate max-w-[140px]" style={{ color: topSeat === activeSeat ? '#fde047' : '#fff' }}>{seatByIdx(topSeat).username}</p>
                    <div className="flex gap-0.5">{Array.from({ length: Math.min(seatByIdx(topSeat).handCount || 0, 5) }).map((_, i) => <CardBack key={i} small />)}</div>
                    {trickCardFor(topSeat) && <PlayingCard card={trickCardFor(topSeat)} small />}
                </div>
                <div className="flex items-center justify-between" style={{ minHeight: 100 }}>
                    <div className="flex flex-col items-center gap-1 w-20">
                        <p className="text-[11px] font-bold truncate max-w-[70px]" style={{ color: leftSeat === activeSeat ? '#fde047' : '#fff' }}>{seatByIdx(leftSeat).username}</p>
                        <div className="flex flex-wrap justify-center gap-0.5">{Array.from({ length: Math.min(seatByIdx(leftSeat).handCount || 0, 5) }).map((_, i) => <CardBack key={i} small />)}</div>
                    </div>
                    <div className="flex items-center gap-1.5" style={{ minHeight: 90 }}>
                        {trickCardFor(leftSeat) && <PlayingCard card={trickCardFor(leftSeat)} small />}
                        {trickCardFor(bottomSeat) && <PlayingCard card={trickCardFor(bottomSeat)} small />}
                        {trickCardFor(rightSeat) && <PlayingCard card={trickCardFor(rightSeat)} small />}
                        {(!state.trick || state.trick.length === 0) && <span className="text-3xl opacity-30">🎴</span>}
                    </div>
                    <div className="flex flex-col items-center gap-1 w-20">
                        <p className="text-[11px] font-bold truncate max-w-[70px]" style={{ color: rightSeat === activeSeat ? '#fde047' : '#fff' }}>{seatByIdx(rightSeat).username}</p>
                        <div className="flex flex-wrap justify-center gap-0.5">{Array.from({ length: Math.min(seatByIdx(rightSeat).handCount || 0, 5) }).map((_, i) => <CardBack key={i} small />)}</div>
                    </div>
                </div>
            </div>

            <div className={`text-center mt-2 rounded-xl py-2 transition ${(isMyTurn || (state.phase === 'choosingTrump' && state.highestBidder === mySeat)) ? 'bg-amber-500/20' : ''}`}>
                <p className={(isMyTurn || (state.phase === 'choosingTrump' && state.highestBidder === mySeat)) ? 'text-amber-300 font-black' : 'text-amber-300/80 text-xs font-bold'}
                    style={(isMyTurn || (state.phase === 'choosingTrump' && state.highestBidder === mySeat)) ? { fontSize: '1rem' } : undefined}>
                    {state.phase === 'bidding' && (
                        <>{isMyTurn ? 'Sıra sende — ihale ver veya pas geç' : `${seatByIdx(state.turn).username} ihale veriyor...`}
                            {state.highestBid > 0 ? `  ·  En yüksek: ${state.highestBid} (${seatByIdx(state.highestBidder).username})` : ''}</>
                    )}
                    {state.phase === 'choosingTrump' && (
                        state.highestBidder === mySeat ? 'Koz seç' : `${seatByIdx(state.highestBidder).username} koz seçiyor...`
                    )}
                    {state.phase === 'playing' && (isMyTurn ? 'Sıra sende' : `${seatByIdx(state.turn).username} oynuyor...`)}
                </p>
                {hint && <p className="text-red-300 text-xs font-bold mt-1">{hint}</p>}
            </div>

            {state.phase === 'bidding' && isMyTurn && (
                <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1">
                    {bidOptions.map(n => (
                        <button key={n} onClick={() => placeBid(n)} className="bg-white/90 rounded-lg px-3.5 py-2 font-black text-gray-900 flex-shrink-0">{n}</button>
                    ))}
                    <button onClick={() => placeBid('PASS')} className="bg-red-600 text-white rounded-lg px-4 py-2 font-bold flex-shrink-0">Pas</button>
                </div>
            )}

            {state.phase === 'choosingTrump' && state.highestBidder === mySeat && (
                <div className="flex justify-center gap-3 mt-3">
                    {['S', 'H', 'D', 'C'].map(suit => (
                        <button key={suit} onClick={() => chooseTrump(suit)} className="bg-white/90 rounded-xl w-12 h-12 flex items-center justify-center text-2xl font-black" style={{ color: SUIT_COLOR[suit] }}>
                            {SUIT_SYMBOL[suit]}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex justify-center gap-2 mt-4 overflow-x-auto pb-2">
                {hand.map(card => (
                    <PlayingCard key={card} card={card}
                        disabled={!(state.phase === 'playing' && isMyTurn && legalCards.includes(card))}
                        onClick={playCard} />
                ))}
            </div>

            {roundEnd && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 rounded-2xl p-6 w-80">
                        <p className="text-white font-black text-lg text-center mb-3">El Bitti</p>
                        <p className="text-gray-300 text-sm text-center mb-2">
                            {seatByIdx(roundEnd.bidder).username} — İhale: {roundEnd.bid}, Aldığı el: {roundEnd.tricksWon[roundEnd.bidder]}
                        </p>
                        {state.seats.map(seat => (
                            <p key={seat.seat} className="text-gray-400 text-xs text-center">
                                {seat.userId === myId ? 'Sen' : seat.username}: {roundEnd.delta[seat.seat] >= 0 ? '+' : ''}{roundEnd.delta[seat.seat]} → {roundEnd.scores[seat.seat]}
                            </p>
                        ))}
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

function BatakLobby({ myName, onMatched }) {
    const [searching, setSearching] = useState(false);
    const [queuePos, setQueuePos] = useState(null);
    const [difficulty, setDifficulty] = useState('medium');
    const navigatedRef = useRef(false);

    useEffect(() => { getSocket()?.emit('batak:setUsername', myName); }, [myName]);

    useEffect(() => {
        const offQueued = onSocket('batak:queued', (data) => setQueuePos(data.position));
        const offMatched = onSocket('batak:matched', (data) => {
            if (navigatedRef.current) return;
            navigatedRef.current = true;
            setSearching(false);
            onMatched(data.tableId);
        });
        const offErr = onSocket('batak:error', (data) => { setSearching(false); alert(data?.message || 'Bir hata oluştu.'); });
        return () => { offQueued(); offMatched(); offErr(); };
    }, [onMatched]);

    const startSearch = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        setSearching(true); setQueuePos(null);
        socket.emit('batak:findMatch');
    };
    const cancelSearch = () => { getSocket()?.emit('batak:cancelFindMatch'); setSearching(false); setQueuePos(null); };
    const startVsBots = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:playVsBots', { difficulty });
    };

    return (
        <div className="max-w-md mx-auto">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center mb-4">
                <p className="text-5xl mb-3">🃏</p>
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

function BatakPage() {
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
            <Navbar onBack={() => navigate(-1)} title="Batak" />
            <div className="px-4 py-6">
                {tableId
                    ? <BatakBoard tableId={tableId} myId={myId} onExit={() => setTableId(null)} />
                    : <BatakLobby myName={user?.fullName || user?.username || 'Oyuncu'} onMatched={setTableId} />}
            </div>
        </div>
    );
}

export default BatakPage;
