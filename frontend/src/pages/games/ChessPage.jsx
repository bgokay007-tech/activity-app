import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Chess } from 'chess.js';
import Navbar from '../../components/Navbar';
import { connectSocket, getSocket, onSocket } from '../../services/socket';

const PIECE_SYMBOL = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const LIGHT_SQ = '#eed9b6';
const DARK_SQ = '#a97756';

function squareName(file, rank) { return `${FILES[file]}${rank + 1}`; }

function ChessBoard({ tableId, myId, onExit }) {
    const [state, setState] = useState(null);
    const [gameEnd, setGameEnd] = useState(null);
    const [selected, setSelected] = useState(null);
    const [pendingPromotion, setPendingPromotion] = useState(null);

    useEffect(() => {
        getSocket()?.emit('chess:getState', { tableId });
        const offState = onSocket('chess:state', (data) => { if (data.tableId === tableId) { setState(data); setSelected(null); } });
        const offEnd = onSocket('chess:gameEnd', (data) => setGameEnd(data));
        const offErr = onSocket('chess:error', (data) => alert(data?.message || 'Bir hata oluştu.'));
        return () => { offState(); offEnd(); offErr(); };
    }, [tableId]);

    const leaveTable = useCallback(() => { getSocket()?.emit('chess:leaveTable', { tableId }); }, [tableId]);
    useEffect(() => () => leaveTable(), [leaveTable]);

    const chess = useMemo(() => {
        if (!state?.fen) return null;
        try { return new Chess(state.fen); } catch { return null; }
    }, [state?.fen]);
    const board = useMemo(() => (chess ? chess.board() : null), [chess]);
    const legalTargets = useMemo(() => {
        if (!chess || !selected) return [];
        return chess.moves({ square: selected, verbose: true }).map(m => m.to);
    }, [chess, selected]);

    if (!state || !board) {
        return <p className="text-gray-500 text-sm text-center py-16">Masaya bağlanılıyor...</p>;
    }

    const myPlayerIdx = state.players.findIndex(p => p.userId === myId);
    const myColor = myPlayerIdx === 0 ? 'w' : 'b';
    const isMyTurn = state.turn === myPlayerIdx && state.phase === 'playing';
    const flipped = myColor === 'b';
    const oppPlayer = state.players[myPlayerIdx === 0 ? 1 : 0];

    const onSquareClick = (square, pieceHere) => {
        if (!isMyTurn) return;
        if (selected) {
            if (legalTargets.includes(square)) {
                const piece = chess.get(selected);
                const isPromotion = piece?.type === 'p' && (square[1] === '8' || square[1] === '1');
                if (isPromotion) setPendingPromotion({ from: selected, to: square });
                else getSocket()?.emit('chess:move', { tableId, from: selected, to: square });
                setSelected(null);
                return;
            }
            if (pieceHere && pieceHere.color === myColor) { setSelected(square); return; }
            setSelected(null);
            return;
        }
        if (pieceHere && pieceHere.color === myColor) setSelected(square);
    };

    const confirmPromotion = (piece) => {
        if (!pendingPromotion) return;
        getSocket()?.emit('chess:move', { tableId, from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece });
        setPendingPromotion(null);
    };

    const resign = () => {
        if (confirm('Bu oyunu kaybetmiş sayılacaksın. Emin misin?')) getSocket()?.emit('chess:resign', { tableId });
    };

    const ranks = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    const files = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const lastMoveSquares = state.lastMove ? [state.lastMove.from, state.lastMove.to] : [];
    const kingInCheckSquare = (() => {
        if (!state.inCheck || !chess) return null;
        const turnColor = chess.turn();
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
            const p = board[r][f];
            if (p && p.type === 'k' && p.color === turnColor) return squareName(f, 7 - r);
        }
        return null;
    })();

    const winnerLabel = (g) => {
        if (!g) return '';
        if (g.winner === 'draw') return 'Berabere';
        return g.winner === myPlayerIdx ? 'Kazandın! 🏆' : 'Kaybettin';
    };
    const REASON_LABEL = { checkmate: 'Şah mat', resign: 'Rakip oyunu terk etti', stalemate: 'Pat', repetition: 'Üç tekrar', insufficient_material: 'Yetersiz materyal', fifty_move: '50 hamle kuralı' };

    return (
        <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-bold">♞ Satranç</h2>
                <button onClick={resign} className="bg-white/10 text-red-300 text-xs font-bold px-3 py-1.5 rounded-lg">🏳️ Terk Et</button>
            </div>

            <p className="text-white text-sm font-bold text-center mb-2">
                {oppPlayer?.username}{!oppPlayer?.connected && !oppPlayer?.isBot ? ' (💤)' : ''} · {myColor === 'w' ? '⚫' : '⚪'}
            </p>

            <div className="mx-auto rounded overflow-hidden border-2 border-black/40" style={{ width: 'min(90vw, 420px)' }}>
                {ranks.map(r => (
                    <div key={r} className="flex">
                        {files.map(f => {
                            const square = squareName(f, r);
                            const piece = board[7 - r][f];
                            const isDark = (f + r) % 2 === 0;
                            const isSelected = selected === square;
                            const isTarget = legalTargets.includes(square);
                            const isLastMove = lastMoveSquares.includes(square);
                            const isCheck = kingInCheckSquare === square;
                            const bg = isSelected ? '#5b8c3a' : isCheck ? '#dc2626' : isLastMove ? '#c9b46a' : (isDark ? DARK_SQ : LIGHT_SQ);
                            return (
                                <button key={square} onClick={() => onSquareClick(square, piece)}
                                    className="relative flex items-center justify-center flex-shrink-0"
                                    style={{ width: 'calc(min(90vw, 420px) / 8)', height: 'calc(min(90vw, 420px) / 8)', backgroundColor: bg }}>
                                    {piece && <span style={{ fontSize: 'calc(min(90vw, 420px) / 8 * 0.7)', color: piece.color === 'w' ? '#f8fafc' : '#111827' }}>{PIECE_SYMBOL[piece.color][piece.type]}</span>}
                                    {isTarget && !piece && <span className="absolute w-3 h-3 rounded-full bg-black/30" />}
                                    {isTarget && piece && <span className="absolute inset-1 rounded-full border-4 border-black/30" />}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            <p className="text-center text-amber-300 text-sm font-bold mt-3">
                {state.phase !== 'playing' ? 'Oyun bitti'
                    : isMyTurn ? (state.inCheck ? 'Sıra sende — şahsın!' : 'Sıra sende')
                    : `${oppPlayer?.username || ''} oynuyor...`}
            </p>
            <p className="text-white text-sm font-bold text-center mt-2">Sen · {myColor === 'w' ? '⚪' : '⚫'}</p>

            {pendingPromotion && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setPendingPromotion(null)}>
                    <div className="bg-gray-900 rounded-2xl p-5" onClick={e => e.stopPropagation()}>
                        <p className="text-white font-black text-center mb-3">Terfi</p>
                        <div className="flex gap-2.5">
                            {['q', 'r', 'b', 'n'].map(p => (
                                <button key={p} onClick={() => confirmPromotion(p)} className="w-12 h-12 rounded-lg bg-gray-800 border border-gray-700 text-2xl">
                                    {PIECE_SYMBOL[myColor][p]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {gameEnd && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 rounded-2xl p-6 w-80 text-center">
                        <p className="text-white font-black text-lg mb-2">{winnerLabel(gameEnd)}</p>
                        <p className="text-gray-400 text-sm mb-4">{REASON_LABEL[gameEnd.reason] || ''}</p>
                        <button onClick={onExit} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl">Geri Dön</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ChessLobby({ myName, onMatched }) {
    const [searching, setSearching] = useState(false);
    const [queuePos, setQueuePos] = useState(null);
    const [difficulty, setDifficulty] = useState('medium');
    const navigatedRef = useRef(false);

    useEffect(() => { getSocket()?.emit('chess:setUsername', myName); }, [myName]);

    useEffect(() => {
        const offQueued = onSocket('chess:queued', (data) => setQueuePos(data.position));
        const offMatched = onSocket('chess:matched', (data) => {
            if (navigatedRef.current) return;
            navigatedRef.current = true;
            setSearching(false);
            onMatched(data.tableId);
        });
        const offErr = onSocket('chess:error', (data) => { setSearching(false); alert(data?.message || 'Bir hata oluştu.'); });
        return () => { offQueued(); offMatched(); offErr(); };
    }, [onMatched]);

    const startSearch = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        setSearching(true); setQueuePos(null);
        socket.emit('chess:findMatch');
    };
    const cancelSearch = () => { getSocket()?.emit('chess:cancelFindMatch'); setSearching(false); setQueuePos(null); };
    const startVsBots = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('chess:playVsBots', { difficulty });
    };

    return (
        <div className="max-w-md mx-auto">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center mb-4">
                <p className="text-5xl mb-3">♞</p>
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

function ChessPage() {
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
            <Navbar onBack={() => navigate(-1)} title="Satranç" />
            <div className="px-4 py-6">
                {tableId
                    ? <ChessBoard tableId={tableId} myId={myId} onExit={() => setTableId(null)} />
                    : <ChessLobby myName={user?.fullName || user?.username || 'Oyuncu'} onMatched={setTableId} />}
            </div>
        </div>
    );
}

export default ChessPage;
