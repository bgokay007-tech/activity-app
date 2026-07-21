import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Navbar from '../../components/Navbar';
import { connectSocket, getSocket, onSocket } from '../../services/socket';

const CHECKER_COLOR = ['#f5f5f0', '#1f2937'];
const TOP_ROW    = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const BOTTOM_ROW = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

function computeTarget(player, from, die) {
    if (from === -1) return player === 0 ? 24 - die : die - 1;
    return player === 0 ? from - die : from + die;
}
function isBearOffTarget(player, target) { return player === 0 ? target < 0 : target > 23; }

function Checkers({ count, player }) {
    if (count === 0) return null;
    const n = Math.abs(count);
    const shown = Math.min(n, 5);
    return (
        <div className="flex flex-col items-center gap-0.5">
            {Array.from({ length: shown }).map((_, i) => (
                <div key={i} className="w-4 h-4 rounded-full border" style={{ backgroundColor: CHECKER_COLOR[player], borderColor: '#00000040' }} />
            ))}
            {n > 5 && <span className="text-white text-[10px] font-black">+{n - 5}</span>}
        </div>
    );
}

function Point({ index, count, isTop, selected, dim, onClick }) {
    const alt = isTop ? TOP_ROW.indexOf(index) % 2 === 0 : BOTTOM_ROW.indexOf(index) % 2 === 0;
    const player = count > 0 ? 0 : count < 0 ? 1 : null;
    return (
        <button onClick={() => onClick(index)}
            className="flex-1 flex flex-col items-center py-1 transition"
            style={{ height: 110, backgroundColor: selected ? '#7c3aed88' : (alt ? '#3f2a1a' : '#5a3d24'), opacity: dim ? 0.85 : 1 }}
        >
            <div className={isTop ? 'flex flex-col items-center mt-0.5' : 'flex flex-col items-center justify-end flex-1 mb-0.5'}>
                {player !== null && <Checkers count={count} player={player} />}
            </div>
        </button>
    );
}

function TavlaBoard({ tableId, myId, onExit }) {
    const [state, setState] = useState(null);
    const [gameEnd, setGameEnd] = useState(null);
    const [selectedFrom, setSelectedFrom] = useState(null);

    useEffect(() => {
        getSocket()?.emit('tavla:getState', { tableId });
        const offState = onSocket('tavla:state', (data) => { if (data.tableId === tableId) { setState(data); setSelectedFrom(null); } });
        const offEnd = onSocket('tavla:gameEnd', (data) => setGameEnd(data));
        const offErr = onSocket('tavla:error', (data) => { setSelectedFrom(null); alert(data?.message || 'Bir hata oluştu.'); });
        return () => { offState(); offEnd(); offErr(); };
    }, [tableId]);

    useEffect(() => {
        const leave = () => getSocket()?.emit('tavla:leaveTable', { tableId });
        return leave;
    }, [tableId]);

    if (!state) return <p className="text-gray-500 text-sm text-center py-16">Masaya bağlanılıyor...</p>;

    const myIndex = state.players.findIndex(p => p.userId === myId);
    const myTurn = state.turn === myIndex;
    const opponent = state.players[myIndex === 0 ? 1 : 0];
    const goBack = () => { getSocket()?.emit('tavla:leaveTable', { tableId }); onExit(); };

    const rollDice = () => getSocket()?.emit('tavla:roll', { tableId });
    const ownCount = (idx) => (myIndex === 0 ? state.board[idx] : -state.board[idx]);

    const handlePointClick = (idx) => {
        if (state.phase !== 'moving' || !myTurn) return;
        if (state.bar[myIndex] > 0) return;
        if (ownCount(idx) <= 0) return;
        setSelectedFrom(idx === selectedFrom ? null : idx);
    };
    const handleBarClick = () => {
        if (state.phase !== 'moving' || !myTurn) return;
        if (state.bar[myIndex] <= 0) return;
        setSelectedFrom(-1 === selectedFrom ? null : -1);
    };
    const playDie = (die) => {
        if (selectedFrom === null) return;
        const target = computeTarget(myIndex, selectedFrom, die);
        const to = isBearOffTarget(myIndex, target) ? 'off' : target;
        getSocket()?.emit('tavla:move', { tableId, from: selectedFrom, to, die });
    };

    const distinctDice = [...new Set(state.movesRemaining)];
    const myBorneOff = state.borneOff[myIndex] ?? 0;
    const oppBorneOff = state.borneOff[myIndex === 0 ? 1 : 0] ?? 0;
    const myBar = state.bar[myIndex] ?? 0;
    const oppBar = state.bar[myIndex === 0 ? 1 : 0] ?? 0;

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-bold">🎲 Tavla</h2>
                <button onClick={goBack} className="bg-white/10 text-gray-300 text-xs font-bold px-3 py-1.5 rounded-lg">← Ayrıl</button>
            </div>

            <div className="flex gap-2 mb-3">
                <div className="flex-1 bg-white/10 rounded-lg py-1.5 text-center">
                    <p className="text-white text-xs font-bold">Sen{!state.players[myIndex]?.connected ? ' 🤖' : ''}</p>
                    <p className="text-amber-400 text-xs font-bold">Çıkan: {myBorneOff}/15</p>
                </div>
                <div className="flex-1 bg-white/10 rounded-lg py-1.5 text-center">
                    <p className="text-white text-xs font-bold truncate">{opponent?.username}{opponent && !opponent.connected ? ' 🤖' : ''}</p>
                    <p className="text-amber-400 text-xs font-bold">Çıkan: {oppBorneOff}/15</p>
                </div>
            </div>

            <div className="rounded-lg overflow-hidden border-4" style={{ backgroundColor: '#7c4a24', borderColor: '#4a2c14' }}>
                <div className="flex">
                    {TOP_ROW.map(idx => (
                        <Point key={idx} index={idx} count={state.board[idx]} isTop selected={selectedFrom === idx}
                            dim={selectedFrom !== null && selectedFrom !== idx} onClick={handlePointClick} />
                    ))}
                </div>
                <button onClick={handleBarClick} className="w-full py-1 flex flex-col items-center justify-center" style={{ backgroundColor: selectedFrom === -1 ? '#7c3aed88' : '#4a2c14', minHeight: 30 }}>
                    <span className="text-amber-200 text-[9px] font-bold mb-1">Bar</span>
                    <div className="flex gap-2">
                        {oppBar > 0 && <Checkers count={-oppBar} player={myIndex === 0 ? 1 : 0} />}
                        {myBar > 0 && <Checkers count={myBar} player={myIndex} />}
                    </div>
                </button>
                <div className="flex">
                    {BOTTOM_ROW.map(idx => (
                        <Point key={idx} index={idx} count={state.board[idx]} isTop={false} selected={selectedFrom === idx}
                            dim={selectedFrom !== null && selectedFrom !== idx} onClick={handlePointClick} />
                    ))}
                </div>
            </div>

            <p className="text-amber-300 text-xs font-bold text-center mt-3">
                {state.phase === 'finished' ? '🏆 Oyun Bitti'
                    : state.phase === 'rolling' ? (myTurn ? 'Sıra sende — zar at' : `${opponent?.username || ''} zar atıyor...`)
                    : (myTurn ? (selectedFrom !== null ? 'Bir zar seç' : 'Bir taş seç') : `${opponent?.username || ''} oynuyor...`)}
            </p>

            {state.phase === 'rolling' && myTurn && (
                <div className="flex justify-center mt-2">
                    <button onClick={rollDice} className="bg-purple-600 hover:bg-purple-500 text-white font-black px-8 py-3 rounded-2xl transition">🎲 Zar At</button>
                </div>
            )}

            {state.phase === 'moving' && (
                <div className="flex justify-center items-center gap-2 mt-3 flex-wrap">
                    {state.dice.map((d, i) => (
                        <div key={i} className="w-9 h-9 rounded-lg bg-white/90 flex items-center justify-center font-black text-gray-900" style={{ opacity: state.movesRemaining.includes(d) ? 1 : 0.25 }}>
                            {d}
                        </div>
                    ))}
                    {myTurn && selectedFrom !== null && distinctDice.map(d => (
                        <button key={`play${d}`} onClick={() => playDie(d)} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-2.5 py-2 rounded-lg transition">
                            {d} oyna
                        </button>
                    ))}
                </div>
            )}

            {gameEnd && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 rounded-2xl p-6 w-80 text-center">
                        <p className="text-white font-black text-lg mb-4">{gameEnd.winner === myIndex ? '🏆 Kazandın!' : 'Kaybettin'}</p>
                        <button onClick={goBack} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl">Geri Dön</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function TavlaLobby({ myName, onMatched }) {
    const [searching, setSearching] = useState(false);
    const [queuePos, setQueuePos] = useState(null);
    const [difficulty, setDifficulty] = useState('medium');
    const navigatedRef = useRef(false);

    useEffect(() => { getSocket()?.emit('tavla:setUsername', myName); }, [myName]);

    useEffect(() => {
        const offQueued = onSocket('tavla:queued', (data) => setQueuePos(data.position));
        const offMatched = onSocket('tavla:matched', (data) => {
            if (navigatedRef.current) return;
            navigatedRef.current = true;
            setSearching(false);
            onMatched(data.tableId);
        });
        const offErr = onSocket('tavla:error', (data) => { setSearching(false); alert(data?.message || 'Bir hata oluştu.'); });
        return () => { offQueued(); offMatched(); offErr(); };
    }, [onMatched]);

    const startSearch = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        setSearching(true); setQueuePos(null);
        socket.emit('tavla:findMatch');
    };
    const cancelSearch = () => { getSocket()?.emit('tavla:cancelFindMatch'); setSearching(false); setQueuePos(null); };
    const startVsBots = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('tavla:playVsBots', { difficulty });
    };

    return (
        <div className="max-w-md mx-auto">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center mb-4">
                <p className="text-5xl mb-3">🎲</p>
                {searching ? (
                    <>
                        <p className="text-white font-bold mb-3">Rakip aranıyor{queuePos ? ` (${queuePos})` : ''}...</p>
                        <button onClick={cancelSearch} className="bg-gray-800 border border-gray-700 text-gray-300 font-bold px-4 py-2 rounded-xl text-sm">Vazgeç</button>
                    </>
                ) : (
                    <button onClick={startSearch} className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 rounded-xl">
                        🎯 Rakip Bul
                    </button>
                )}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <p className="text-gray-400 text-xs font-bold mb-2">🤖 Bota Karşı Oyna</p>
                <div className="flex gap-2 mb-3">
                    {[['easy', 'Kolay'], ['medium', 'Orta'], ['hard', 'Zor']].map(([k, l]) => (
                        <button key={k} onClick={() => setDifficulty(k)}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold border transition ${difficulty === k ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                            {l}
                        </button>
                    ))}
                </div>
                <button onClick={startVsBots} className="w-full bg-gray-800 border border-gray-700 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-gray-700 transition">
                    Bota Karşı Başla
                </button>
            </div>
        </div>
    );
}

function TavlaPage() {
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
            <Navbar onBack={() => navigate(-1)} title="Tavla" />
            <div className="px-4 py-6">
                {tableId
                    ? <TavlaBoard tableId={tableId} myId={myId} onExit={() => setTableId(null)} />
                    : <TavlaLobby myName={user?.fullName || user?.username || 'Oyuncu'} onMatched={setTableId} />}
            </div>
        </div>
    );
}

export default TavlaPage;
