import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Navbar from '../../components/Navbar';
import Avatar from '../../components/Avatar';
import api from '../../services/api';
import { connectSocket, getSocket, onSocket } from '../../services/socket';

const COLOR_HEX = { R: '#dc2626', Y: '#ca8a04', B: '#2563eb', K: '#111827' };
function isJokerTile(t) { return t === 'J1' || t === 'J2'; }
function tileColorCode(t) { return t[0]; }
function tileNumLabel(t) { return t.slice(1); }

function OkeyTile({ tile, small, disabled, highlighted, rejected, popIn, onClick, onPointerDown, onPointerMove, onPointerUp, style }) {
    const joker = isJokerTile(tile);
    const colorHex = joker ? '#b45309' : COLOR_HEX[tileColorCode(tile)];
    const sizeCls = small ? 'w-6 h-9' : 'w-10 h-14';
    return (
        <button onClick={onClick ? () => onClick(tile) : undefined}
            onPointerDown={onPointerDown ? (e) => onPointerDown(e, tile) : undefined}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className={`${sizeCls} rounded-md flex items-center justify-center border-2 flex-shrink-0 transition-all duration-150 ${rejected ? 'animate-[okeyShake_0.4s_ease-in-out]' : ''} ${popIn ? 'animate-[tilePopIn_0.28s_ease-out]' : ''}`}
            style={{
                background: highlighted ? 'linear-gradient(180deg, #fffdf5 0%, #fff2c7 100%)' : 'linear-gradient(180deg, #fffdf8 0%, #f3e8cf 100%)',
                borderColor: rejected ? '#ef4444' : (highlighted ? '#f59e0b' : '#d6c6a1'),
                boxShadow: highlighted ? '0 2px 0 #b45309, 0 4px 6px rgba(0,0,0,.35)' : '0 2px 0 #b8a276, 0 3px 5px rgba(0,0,0,.35)',
                opacity: disabled ? 0.45 : 1, cursor: onClick ? 'pointer' : 'default',
                touchAction: onPointerDown ? 'none' : undefined, ...style,
            }}>
            {joker ? <span className={small ? 'text-xs' : 'text-lg'}>🃏</span> : <span className={`font-black ${small ? 'text-[11px]' : 'text-lg'}`} style={{ color: colorHex, textShadow: '0 1px 0 rgba(255,255,255,.5)' }}>{tileNumLabel(tile)}</span>}
        </button>
    );
}

// Basılı tutup sürükleme + tıklama (tap) desteği tek bir yerden — bir taşa basılı
// tutup uygun bölgeye (atım/istaka) sürükleyince işlem tetiklenir; sadece dokunup
// bırakınca (sürüklemeden) da eski tıkla-at/çek davranışı aynen çalışmaya devam eder.
// Gerçek bir sürükleme sonrası tarayıcının kendiliğinden ürettiği "click" olayının
// işlemi bir daha tetiklememesi için suppressClickRef ile bastırılıyor.
function useDragOrTap(action, dropZoneRef) {
    const dragRef = useRef(null);
    const suppressClickRef = useRef(false);
    const [ghost, setGhost] = useState(null);

    const onPointerDown = (e, payload) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false, payload, pointerId: e.pointerId };
    };
    const onPointerMove = (e) => {
        const d = dragRef.current;
        if (!d || e.pointerId !== d.pointerId) return;
        const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
        if (!d.moved && Math.hypot(dx, dy) > 8) d.moved = true;
        if (d.moved) setGhost({ x: e.clientX, y: e.clientY, payload: d.payload });
    };
    const onPointerUp = (e) => {
        const d = dragRef.current;
        if (!d || e.pointerId !== d.pointerId) return;
        dragRef.current = null;
        setGhost(null);
        if (d.moved) {
            suppressClickRef.current = true;
            let dropped = false;
            if (dropZoneRef.current) {
                const r = dropZoneRef.current.getBoundingClientRect();
                dropped = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            }
            if (dropped) action(d.payload);
        }
    };
    const onClick = (payload) => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        action(payload);
    };
    return { onPointerDown, onPointerMove, onPointerUp, onClick, ghost };
}
function TileBack({ small }) {
    const sizeCls = small ? 'w-6 h-9' : 'w-10 h-14';
    return (
        <div className={`${sizeCls} rounded-md flex-shrink-0`} style={{
            background: 'repeating-linear-gradient(45deg, #7a1730, #7a1730 4px, #5c1024 4px, #5c1024 8px)',
            border: '1px solid #d4af37', boxShadow: 'inset 0 0 0 2px rgba(0,0,0,.25), 0 2px 4px rgba(0,0,0,.4)',
        }} />
    );
}

// Özel masa bekleme odası — kurucu 3. koltuğu bir arkadaşıyla doldurana kadar burada
// bekler: masa kodunu paylaşabilir veya doğrudan arkadaş listesinden davet gönderebilir.
function WaitingRoom({ state, myId, tableId, onExit }) {
    const [friends, setFriends] = useState([]);
    const [loadingFriends, setLoadingFriends] = useState(true);
    const [onlineIds, setOnlineIds] = useState(new Set());
    const [invited, setInvited] = useState(new Set());
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        api.get('/friends')
            .then(({ data }) => setFriends(Array.isArray(data) ? data : []))
            .catch(() => {})
            .finally(() => setLoadingFriends(false));
    }, []);

    useEffect(() => {
        const socket = getSocket();
        if (!socket || friends.length === 0) return;
        socket.emit('presence:query', friends.map(f => f.id), (online) => setOnlineIds(new Set(online || [])));
    }, [friends]);

    useEffect(() => onSocket('okey:inviteSent', (data) => setInvited(prev => new Set(prev).add(data.userId))), []);

    const inviteFriend = (friendId) => getSocket()?.emit('okey:inviteFriend', { tableId, userId: friendId });
    const copyCode = () => {
        navigator.clipboard?.writeText(state.code || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
    };

    return (
        <div className="max-w-md mx-auto">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center mb-4">
                <p className="text-gray-400 text-xs font-bold mb-2">Masa Kodu</p>
                <p className="text-white text-3xl font-black tracking-[0.3em] mb-3">{state.code}</p>
                <button onClick={copyCode} className="bg-gray-800 border border-gray-700 text-gray-300 font-bold px-4 py-2 rounded-xl text-xs">
                    {copied ? '✓ Kopyalandı' : 'Kodu Kopyala'}
                </button>
                <p className="text-gray-500 text-[11px] mt-3">Bu kodu paylaşarak arkadaşların masaya katılabilir.</p>
            </div>

            <div className="flex gap-1.5 mb-4">
                {state.seats.map(seat => (
                    <div key={seat.seat} className="flex-1 rounded-lg py-2 text-center border border-gray-800 bg-gray-900 flex flex-col items-center gap-1">
                        {seat.open ? (
                            <>
                                <div className="w-7 h-7 rounded-full border-2 border-dashed border-gray-700" />
                                <p className="text-[10px] text-gray-600 font-bold">Boş</p>
                            </>
                        ) : (
                            <>
                                <Avatar user={seat} size="xs" />
                                <p className="text-[10px] font-bold text-white truncate w-full">{seat.userId === myId ? 'Sen' : seat.username}</p>
                            </>
                        )}
                    </div>
                ))}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4">
                <p className="text-gray-400 text-xs font-bold mb-2">Arkadaşlarını Davet Et</p>
                {loadingFriends ? (
                    <p className="text-gray-600 text-xs text-center py-3">Yükleniyor...</p>
                ) : friends.length === 0 ? (
                    <p className="text-gray-600 text-xs text-center py-3">Henüz arkadaşın yok.</p>
                ) : (
                    <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                        {friends.map(f => {
                            const alreadySeated = state.seats.some(s => s.userId === f.id);
                            const isInvited = invited.has(f.id);
                            return (
                                <div key={f.id} className="flex items-center gap-2">
                                    <Avatar user={f} size="xs" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-xs font-bold truncate">{f.fullName || f.username}</p>
                                        <p className="text-[10px]" style={{ color: onlineIds.has(f.id) ? '#4ade80' : '#6b7280' }}>{onlineIds.has(f.id) ? '● Çevrimiçi' : '○ Çevrimdışı'}</p>
                                    </div>
                                    <button onClick={() => inviteFriend(f.id)} disabled={alreadySeated || isInvited}
                                        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg flex-shrink-0 ${alreadySeated || isInvited ? 'bg-gray-800 text-gray-600' : 'bg-purple-600 text-white'}`}>
                                        {alreadySeated ? 'Masada' : isInvited ? 'Gönderildi' : 'Davet Et'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <button onClick={onExit} className="w-full bg-gray-800 border border-gray-700 text-gray-300 font-bold py-2.5 rounded-xl text-sm">Masadan Ayrıl</button>
        </div>
    );
}

function OkeyBoard({ tableId, myId, onExit, onActiveWagerChange }) {
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

    // Elde bir taş fazlalaştığında (çekildiğinde) o taş kısa bir "pop-in" animasyonuyla beliriyor.
    const prevHandLenRef = useRef(0);
    const [justDrawnIndex, setJustDrawnIndex] = useState(-1);
    const justDrawnTimerRef = useRef(null);
    useEffect(() => {
        if (hand.length > prevHandLenRef.current) {
            setJustDrawnIndex(hand.length - 1);
            if (justDrawnTimerRef.current) clearTimeout(justDrawnTimerRef.current);
            justDrawnTimerRef.current = setTimeout(() => setJustDrawnIndex(-1), 300);
        }
        prevHandLenRef.current = hand.length;
    }, [hand]);
    useEffect(() => () => { if (justDrawnTimerRef.current) clearTimeout(justDrawnTimerRef.current); }, []);

    // Atım yığınının üstü değiştiğinde (biri taş attığında) o taş her seferinde
    // yeniden "pop-in" oynasın diye anahtarını artırıyoruz (React'i yeniden mount etmeye zorlar).
    const prevDiscardTopRef = useRef(undefined);
    const [discardAnimKey, setDiscardAnimKey] = useState(0);
    useEffect(() => {
        if (state?.discardTop !== undefined && state.discardTop !== prevDiscardTopRef.current) {
            setDiscardAnimKey(k => k + 1);
        }
        prevDiscardTopRef.current = state?.discardTop;
    }, [state?.discardTop]);

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

    // Bahisli bir el aktif oynanırken (bekleme odası/oyun bitmiş değilken) üst bileşene
    // haber veriliyor ki sekme kapatma/geri gitmede uyarı gösterilebilsin.
    useEffect(() => {
        const active = !!(state && (state.betAmount > 0 || state.ratingAmount > 0) && state.phase !== 'waiting' && state.phase !== 'finished');
        onActiveWagerChange?.(active);
    }, [state?.betAmount, state?.phase, onActiveWagerChange]);
    useEffect(() => () => onActiveWagerChange?.(false), [onActiveWagerChange]);

    // Basılı tut + sürükle: elimdeki taşı atım bölgesine (discardZoneRef), deste/atım
    // yığınındaki taşı da rafıma (handZoneRef) sürükleyip bırakınca işlem tetiklenir.
    // Hook'lar erken dönüşten önce (Hooks kurallarına uymak için) çağrılmalı, ama
    // gerçek eylem fonksiyonları (onTileClick vb.) state hazır olmadan tanımlanamıyor —
    // bu yüzden en güncel eylem bir ref üzerinden çağrılıyor (aşağıda atanıyor).
    const discardZoneRef = useRef(null);
    const handZoneRef = useRef(null);
    const onTileClickRef = useRef(() => {});
    const onDrawRef = useRef(() => {});
    const dragHand = useDragOrTap((tile) => onTileClickRef.current(tile), discardZoneRef);
    const dragDraw = useDragOrTap((payload) => onDrawRef.current(payload), handZoneRef);

    if (!state) return <p className="text-gray-500 text-sm text-center py-16">Masaya bağlanılıyor...</p>;

    if (state.phase === 'waiting') {
        return <WaitingRoom state={state} myId={myId} tableId={tableId} onExit={() => { getSocket()?.emit('okey:leaveTable', { tableId }); onExit(); }} />;
    }

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
    const goBack = () => {
        const isActiveWager = (state.betAmount > 0 || state.ratingAmount > 0) && state.phase !== 'finished';
        if (isActiveWager && !confirm(LEAVE_WARNING)) return;
        getSocket()?.emit('okey:leaveTable', { tableId });
        onExit();
    };

    onTileClickRef.current = onTileClick;
    onDrawRef.current = (payload) => { if (payload.source === 'deck') drawFromDeck(); else drawFromDiscard(); };

    // Herkes taşını kendi istakasının yanına attığı için atım yığını artık tek ortak
    // bir yer değil, o taşı en son atan koltuğun yanında gösteriliyor — sadece en son
    // atılan (ve dolayısıyla şu an çekilebilir olan) taş etkileşimli.
    const renderDiscardSlot = (seatNum, small) => {
        const isLive = state.discardTopSeat === seatNum && state.discardTop;
        if (!isLive) return <div className={small ? 'w-6 h-9' : 'w-10 h-14'} />;
        return (
            <OkeyTile key={`discard-${discardAnimKey}`} tile={state.discardTop} small={small}
                highlighted={isHighlighted(state.discardTop)} popIn
                onClick={dragDraw.onClick.bind(null, { source: 'discard' })}
                onPointerDown={canDraw ? (e) => dragDraw.onPointerDown(e, { source: 'discard' }) : undefined}
                onPointerMove={canDraw ? dragDraw.onPointerMove : undefined}
                onPointerUp={canDraw ? dragDraw.onPointerUp : undefined}
                style={{ opacity: canDraw ? 1 : 0.55, cursor: canDraw ? 'grab' : 'default' }}
            />
        );
    };

    return (
        <div className="max-w-3xl mx-auto">
            <style>{`
                @keyframes okeyShake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
                @keyframes tilePopIn { 0% { transform: scale(0.4); opacity: 0; } 65% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
            `}</style>
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
                    <div key={seat.seat} className="flex-1 rounded-lg py-1.5 px-1 text-center border transition flex flex-col items-center gap-1"
                        style={seat.seat === state.turn ? { backgroundColor: '#fbbf2433', borderColor: '#fbbf24' } : { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'transparent' }}>
                        <Avatar user={seat} size="xs" ring={seat.seat === state.turn} />
                        <p className="text-[10px] font-bold truncate w-full" style={{ color: seat.seat === state.turn ? '#fde047' : '#fff' }}>
                            {seat.userId === myId ? 'Sen' : seat.username}{seat.seat === state.dealerIndex ? ' 🎯' : ''}{!seat.connected ? ' 🤖' : ''}
                        </p>
                        <p className="text-sm font-black" style={{ color: state.scores[seat.seat] < 0 ? '#f87171' : '#4ade80' }}>{state.scores[seat.seat]}</p>
                    </div>
                ))}
            </div>

            <div className="rounded-2xl p-3 border-4" style={{
                background: 'radial-gradient(ellipse at center, #14532d 0%, #0b3d1f 65%, #062615 100%)',
                borderColor: '#3f2a14', boxShadow: 'inset 0 0 30px rgba(0,0,0,.5), 0 6px 16px rgba(0,0,0,.4)', minHeight: 320,
            }}>
                <div className="flex flex-col items-center gap-1 mb-2">
                    <Avatar user={seatByIdx(topSeat)} size="xs" ring={topSeat === state.turn} />
                    <p className="text-xs font-bold truncate max-w-[140px]" style={{ color: topSeat === state.turn ? '#fde047' : '#fff' }}>{seatByIdx(topSeat).username}</p>
                    <div className="flex items-center gap-1.5">
                        <div className="flex flex-wrap justify-center gap-0.5 max-w-xs">
                            {Array.from({ length: Math.min(seatByIdx(topSeat).handCount || 0, 7) }).map((_, i) => <TileBack key={i} small />)}
                        </div>
                        {renderDiscardSlot(topSeat, true)}
                    </div>
                </div>
                <div className="flex items-center justify-between" style={{ minHeight: 100 }}>
                    <div className="flex flex-col items-center gap-1 w-24">
                        <Avatar user={seatByIdx(leftSeat)} size="xs" ring={leftSeat === state.turn} />
                        <p className="text-[11px] font-bold truncate max-w-[70px]" style={{ color: leftSeat === state.turn ? '#fde047' : '#fff' }}>{seatByIdx(leftSeat).username}</p>
                        <div className="flex items-center gap-1">
                            <div className="flex flex-wrap justify-center gap-0.5">
                                {Array.from({ length: Math.min(seatByIdx(leftSeat).handCount || 0, 7) }).map((_, i) => <TileBack key={i} small />)}
                            </div>
                            {renderDiscardSlot(leftSeat, true)}
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => dragDraw.onClick({ source: 'deck' })}
                            onPointerDown={canDraw ? (e) => dragDraw.onPointerDown(e, { source: 'deck' }) : undefined}
                            onPointerMove={canDraw ? dragDraw.onPointerMove : undefined}
                            onPointerUp={canDraw ? dragDraw.onPointerUp : undefined}
                            className="flex flex-col items-center transition" style={{ opacity: canDraw ? 1 : 0.5, cursor: canDraw ? 'grab' : 'pointer', touchAction: canDraw ? 'none' : undefined }}>
                            <div className="w-11 h-15 rounded-md" style={{
                                width: 44, height: 60,
                                background: 'repeating-linear-gradient(45deg, #7a1730, #7a1730 4px, #5c1024 4px, #5c1024 8px)',
                                border: '1px solid #d4af37', boxShadow: 'inset 0 0 0 2px rgba(0,0,0,.25), 0 3px 6px rgba(0,0,0,.5)',
                            }} />
                            <span className="text-white text-[11px] font-bold mt-1">{state.deckCount} taş</span>
                        </button>
                    </div>
                    <div className="flex flex-col items-center gap-1 w-24">
                        <Avatar user={seatByIdx(rightSeat)} size="xs" ring={rightSeat === state.turn} />
                        <p className="text-[11px] font-bold truncate max-w-[70px]" style={{ color: rightSeat === state.turn ? '#fde047' : '#fff' }}>{seatByIdx(rightSeat).username}</p>
                        <div className="flex items-center gap-1">
                            {renderDiscardSlot(rightSeat, true)}
                            <div className="flex flex-wrap justify-center gap-0.5">
                                {Array.from({ length: Math.min(seatByIdx(rightSeat).handCount || 0, 7) }).map((_, i) => <TileBack key={i} small />)}
                            </div>
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
                <div className="flex items-end gap-3">
                    <div ref={handZoneRef} className="flex flex-wrap justify-center gap-2 max-w-2xl px-3 pt-2 pb-3 rounded-lg" style={{
                        background: 'linear-gradient(180deg, #a9743a 0%, #7c4e22 100%)',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,.3), 0 3px 6px rgba(0,0,0,.4)',
                        borderBottom: '4px solid #5c3417',
                    }}>
                        {hand.map((tile, i) => (
                            <OkeyTile key={`${tile}_${i}`} tile={tile} highlighted={isHighlighted(tile)} disabled={!canAct} rejected={rejectedTile === tile} popIn={i === justDrawnIndex}
                                onClick={dragHand.onClick}
                                onPointerDown={canAct ? dragHand.onPointerDown : undefined}
                                onPointerMove={canAct ? dragHand.onPointerMove : undefined}
                                onPointerUp={canAct ? dragHand.onPointerUp : undefined}
                                style={canAct ? { cursor: 'grab' } : undefined}
                            />
                        ))}
                    </div>
                    <div ref={discardZoneRef} className="flex flex-col items-center gap-1 pb-2">
                        <span className="text-white/40 text-[9px] font-bold">SEN</span>
                        {renderDiscardSlot(mySeat)}
                    </div>
                </div>
                {canAct && (
                    <button onClick={() => setDeclareMode(v => !v)}
                        className={`mt-2 text-xs font-bold px-3 py-1.5 rounded-lg border transition ${declareMode ? 'bg-amber-500 border-amber-400 text-black' : 'bg-white/10 border-white/20 text-amber-300'}`}>
                        {declareMode ? '✓ Elini aç modu — bir taş seç' : '🏆 Elini Aç'}
                    </button>
                )}
                <p className="text-white/50 text-[10px] mt-1">Basılı tut + sürükle (veya tıkla): at · Uzun basılı tutup elini aç modunda seç</p>
            </div>

            {dragHand.ghost && (
                <div style={{ position: 'fixed', left: dragHand.ghost.x, top: dragHand.ghost.y, transform: 'translate(-50%,-50%) scale(1.15)', pointerEvents: 'none', zIndex: 9999 }}>
                    <OkeyTile tile={dragHand.ghost.payload} highlighted={isHighlighted(dragHand.ghost.payload)} />
                </div>
            )}
            {dragDraw.ghost && (
                <div style={{ position: 'fixed', left: dragDraw.ghost.x, top: dragDraw.ghost.y, transform: 'translate(-50%,-50%) scale(1.15)', pointerEvents: 'none', zIndex: 9999 }}>
                    {dragDraw.ghost.payload.source === 'deck'
                        ? <TileBack />
                        : <OkeyTile tile={state.discardTop} highlighted={isHighlighted(state.discardTop)} />}
                </div>
            )}

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
                                    {gameEnd.payouts?.points?.[seat.seat] > 0 && <span className="text-emerald-400 font-bold"> (+{gameEnd.payouts.points[seat.seat]} puan)</span>}
                                    {gameEnd.payouts?.rating?.[seat.seat] > 0 && <span className="text-sky-400 font-bold"> (+{gameEnd.payouts.rating[seat.seat].toFixed(2)} derece)</span>}
                                </p>
                            ))}
                        {gameEnd.payouts && gameEnd.payouts.points[mySeat] === 0 && gameEnd.payouts.rating[mySeat] === 0 && (state.betAmount > 0 || state.ratingAmount > 0) && (
                            <p className="text-red-400 text-xs text-center mt-2">Bahis puanını/dereceni kaybettin.</p>
                        )}
                        <button onClick={goBack} className="w-full bg-purple-600 text-white font-bold py-2.5 rounded-xl mt-4">Geri Dön</button>
                    </div>
                </div>
            )}
        </div>
    );
}

const BET_TIERS = [50, 100, 250, 500];
const RATING_TIERS = [0, 0.10, 0.25, 0.50];

function OkeyLobby({ myName, onMatched }) {
    const [searching, setSearching] = useState(false);
    const [queuePos, setQueuePos] = useState(null);
    const [difficulty, setDifficulty] = useState('medium');
    const [joinCode, setJoinCode] = useState('');
    const [betAmount, setBetAmount] = useState(100);
    const [ratingAmount, setRatingAmount] = useState(0);
    // Özel masa: serbest miktar — kurucu 1'den istediği kadar puan girebilir (kim
    // katılacağını zaten kod/davetle kendisi belirlediği için sabit kademeye gerek yok.
    const [privateBetAmount, setPrivateBetAmount] = useState('100');
    const [wagerRating, setWagerRating] = useState(false);
    const [privateRatingAmount, setPrivateRatingAmount] = useState('0.10');
    const [ratingRangeMin, setRatingRangeMin] = useState('');
    const [ratingRangeMax, setRatingRangeMax] = useState('');
    // undefined: bakiye/aktivite yükleniyor, null: aktivite henüz eklenmemiş, obje: eklenmiş
    const [interest, setInterest] = useState(undefined);
    const [addingActivity, setAddingActivity] = useState(false);
    const navigatedRef = useRef(false);

    const loadInterest = () => {
        api.get('/interests/my')
            .then(({ data }) => setInterest((Array.isArray(data) ? data : []).find(i => i.category === 'GAMES' && i.subCategory === 'okey') || null))
            .catch(() => setInterest(null));
    };
    useEffect(() => { loadInterest(); }, []);

    const addActivity = () => {
        setAddingActivity(true);
        api.post('/interests/add', { category: 'GAMES', subCategory: 'okey' })
            .then(loadInterest)
            .catch(() => alert('Aktivite eklenemedi, tekrar deneyin.'))
            .finally(() => setAddingActivity(false));
    };

    useEffect(() => { getSocket()?.emit('okey:setUsername', myName); }, [myName]);

    useEffect(() => {
        const offQueued = onSocket('okey:queued', (data) => setQueuePos(data.position));
        const offMatched = onSocket('okey:matched', (data) => {
            if (navigatedRef.current) return;
            navigatedRef.current = true;
            setSearching(false);
            onMatched(data.tableId);
        });
        const offErr = onSocket('okey:error', (data) => {
            setSearching(false);
            if (data?.code === 'ACTIVITY_REQUIRED') { setInterest(null); return; }
            if (data?.code === 'INSUFFICIENT_POINTS' || data?.code === 'INSUFFICIENT_RATING') { loadInterest(); }
            alert(data?.message || 'Bir hata oluştu.');
        });
        return () => { offQueued(); offMatched(); offErr(); };
    }, [onMatched]);

    const startSearch = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        setSearching(true); setQueuePos(null);
        socket.emit('okey:findMatch', { betAmount, ratingAmount });
    };
    const cancelSearch = () => { getSocket()?.emit('okey:cancelFindMatch'); setSearching(false); setQueuePos(null); };
    const startVsBots = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('okey:playVsBots', { difficulty });
    };
    const parsedPrivateBet = Math.max(0, Math.floor(Number(privateBetAmount) || 0));
    const parsedPrivateRating = wagerRating ? Math.max(0, Number(privateRatingAmount) || 0) : 0;
    const parsedRangeMin = ratingRangeMin.trim() === '' ? null : Number(ratingRangeMin);
    const parsedRangeMax = ratingRangeMax.trim() === '' ? null : Number(ratingRangeMax);
    const canAffordPrivate = interest && interest.walletPoints >= parsedPrivateBet && interest.skillRating >= parsedPrivateRating && (parsedPrivateBet > 0 || parsedPrivateRating > 0);

    const createPrivateTable = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('okey:createPrivateTable', {
            betAmount: parsedPrivateBet, ratingAmount: parsedPrivateRating,
            ratingRangeMin: parsedRangeMin, ratingRangeMax: parsedRangeMax,
        });
    };
    const joinByCode = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        if (!joinCode.trim()) return;
        socket.emit('okey:joinByCode', { code: joinCode.trim() });
    };

    if (interest === undefined) {
        return <p className="text-gray-500 text-sm text-center py-16">Yükleniyor...</p>;
    }

    if (interest === null) {
        return (
            <div className="max-w-md mx-auto">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
                    <p className="text-5xl mb-3">🀄</p>
                    <p className="text-white font-bold mb-2">Okey oynamak için önce bu oyunu aktivite olarak ekle</p>
                    <p className="text-gray-400 text-xs mb-4">Eklediğinde 2000 puanla başlarsın. Bu aktiviteyi daha sonra silemezsin, sadece gizleyebilirsin.</p>
                    <button onClick={addActivity} disabled={addingActivity} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl disabled:opacity-50">
                        {addingActivity ? '...' : 'Aktivitelerime Ekle ve Başla (2000 puan)'}
                    </button>
                </div>
            </div>
        );
    }

    const canAfford = interest.walletPoints >= betAmount && interest.skillRating >= ratingAmount && (betAmount > 0 || ratingAmount > 0);
    const stakeLabel = `${betAmount} puan${ratingAmount > 0 ? ` + ${ratingAmount.toFixed(2)} derece` : ''}`;

    return (
        <div className="max-w-md mx-auto">
            <div className="flex items-center justify-center gap-3 mb-4">
                <span className="text-amber-400 font-black text-lg">🪙 {interest.walletPoints} <span className="text-gray-500 text-xs font-normal">puan</span></span>
                <span className="text-sky-400 font-black text-lg">⭐ {interest.skillRating?.toFixed(2)} <span className="text-gray-500 text-xs font-normal">derece</span></span>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center mb-4">
                <p className="text-5xl mb-3">🀄</p>
                <p className="text-gray-400 text-xs font-bold mb-2">Puan Bahsi</p>
                <div className="flex gap-2 justify-center mb-3">
                    {[0, ...BET_TIERS].map(amount => (
                        <button key={amount} onClick={() => setBetAmount(amount)} disabled={interest.walletPoints < amount}
                            className={`px-3 py-2 rounded-lg text-xs font-bold border transition disabled:opacity-30 ${betAmount === amount ? 'bg-amber-500 border-amber-400 text-black' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                            {amount === 0 ? 'Yok' : amount}
                        </button>
                    ))}
                </div>
                <p className="text-gray-400 text-xs font-bold mb-2">Derece Bahsi</p>
                <div className="flex gap-2 justify-center mb-4">
                    {RATING_TIERS.map(amount => (
                        <button key={amount} onClick={() => setRatingAmount(amount)} disabled={interest.skillRating < amount}
                            className={`px-3 py-2 rounded-lg text-xs font-bold border transition disabled:opacity-30 ${ratingAmount === amount ? 'bg-sky-500 border-sky-400 text-black' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                            {amount === 0 ? 'Yok' : amount.toFixed(2)}
                        </button>
                    ))}
                </div>
                {searching ? (
                    <>
                        <p className="text-white font-bold mb-3">Rakip aranıyor{queuePos ? ` (${queuePos}/4)` : ''}...</p>
                        <button onClick={cancelSearch} className="bg-gray-800 border border-gray-700 text-gray-300 font-bold px-4 py-2 rounded-xl text-sm">Vazgeç</button>
                    </>
                ) : (
                    <button onClick={startSearch} disabled={!canAfford} className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 rounded-xl disabled:opacity-40">
                        🎯 Rakip Bul (4 kişilik, {stakeLabel} bahis)
                    </button>
                )}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4">
                <p className="text-gray-400 text-xs font-bold mb-2">👥 Masa Kur (Arkadaşlarınla)</p>

                <label className="block text-gray-500 text-[11px] font-bold mb-1">Puan Bahsi (1'den istediğin kadar)</label>
                <input type="number" min="0" value={privateBetAmount} onChange={e => setPrivateBetAmount(e.target.value)}
                    placeholder="Örn. 250" className="w-full bg-gray-800 border border-gray-700 text-white text-sm font-bold rounded-lg px-3 py-2 mb-1" />
                {interest && parsedPrivateBet > interest.walletPoints && (
                    <p className="text-red-400 text-[11px] mb-2">Bakiyende bu kadar puan yok ({interest.walletPoints} puanın var).</p>
                )}

                <label className="flex items-center gap-2 text-gray-400 text-xs font-bold mt-2 mb-2">
                    <input type="checkbox" checked={wagerRating} onChange={e => setWagerRating(e.target.checked)} />
                    Ayrıca derece de bahse girsin
                </label>
                {wagerRating && (
                    <>
                        <input type="number" min="0" max="5" step="0.01" value={privateRatingAmount} onChange={e => setPrivateRatingAmount(e.target.value)}
                            placeholder="Örn. 0.25" className="w-full bg-gray-800 border border-gray-700 text-white text-sm font-bold rounded-lg px-3 py-2 mb-1" />
                        {interest && parsedPrivateRating > interest.skillRating && (
                            <p className="text-red-400 text-[11px] mb-2">Bu kadar dereceye sahip değilsin ({interest.skillRating?.toFixed(2)}).</p>
                        )}
                    </>
                )}

                <label className="block text-gray-500 text-[11px] font-bold mt-2 mb-1">Rakip Derece Aralığı (isteğe bağlı — sadece bu aralıktaki oyuncular katılabilir)</label>
                <div className="flex gap-2 mb-3">
                    <input type="number" min="0" max="5" step="0.01" value={ratingRangeMin} onChange={e => setRatingRangeMin(e.target.value)}
                        placeholder="Min (örn. 1.50)" className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2" />
                    <input type="number" min="0" max="5" step="0.01" value={ratingRangeMax} onChange={e => setRatingRangeMax(e.target.value)}
                        placeholder="Max (örn. 2.50)" className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2" />
                </div>

                <button onClick={createPrivateTable} disabled={!canAffordPrivate} className="w-full bg-purple-600 text-white font-bold py-2.5 rounded-xl text-sm mb-3 disabled:opacity-40">
                    Masa Kur ({parsedPrivateBet} puan{parsedPrivateRating > 0 ? ` + ${parsedPrivateRating.toFixed(2)} derece` : ''} bahis)
                </button>
                <div className="flex gap-2">
                    <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Masa Kodu"
                        maxLength={5} className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm font-bold tracking-widest text-center rounded-lg px-2 py-2 placeholder:text-gray-600 placeholder:tracking-normal placeholder:font-normal" />
                    <button onClick={joinByCode} className="bg-gray-800 border border-gray-700 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-gray-700 transition">
                        Katıl
                    </button>
                </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <p className="text-gray-400 text-xs font-bold mb-2">🤖 Botlara Karşı Oyna (puansız)</p>
                <div className="flex gap-2 mb-3">
                    {[['easy', 'Kolay'], ['medium', 'Orta'], ['hard', 'Zor'], ['expert', 'Çok Zor']].map(([k, l]) => (
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

const LEAVE_WARNING = 'Oyundan çıkarsan otomatik kaybetmiş sayılacaksın, puanın iade edilmeyecek. Emin misin?';

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
    // Bahisli bir oyun aktif oynanırken (bekleme odasında/oyun bitmişken değil) sekme
    // kapatma/tarayıcı geri tuşuna karşı uyarı gösterilir — 1. mesaj: "geri giderken/
    // sekme değiştirirken kaybetmiş sayılacaksın" uyarısı.
    const [activeWager, setActiveWager] = useState(false);

    useEffect(() => { if (myId) connectSocket(myId); }, [myId]);

    useEffect(() => {
        if (!activeWager) return;
        const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [activeWager]);

    const handleBack = () => {
        if (activeWager && !confirm(LEAVE_WARNING)) return;
        navigate(-1);
    };

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={handleBack} title="Okey" />
            <div className="px-4 py-6">
                {tableId
                    ? <OkeyBoard tableId={tableId} myId={myId} onExit={() => setTableId(null)} onActiveWagerChange={setActiveWager} />
                    : <OkeyLobby myName={user?.fullName || user?.username || 'Oyuncu'} onMatched={setTableId} />}
            </div>
        </div>
    );
}

export default OkeyPage;
