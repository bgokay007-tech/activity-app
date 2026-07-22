import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Navbar from '../../components/Navbar';
import Avatar from '../../components/Avatar';
import api from '../../services/api';
import { connectSocket, getSocket, onSocket } from '../../services/socket';

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR = { S: '#111827', C: '#111827', H: '#dc2626', D: '#dc2626' };
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

function rankLabel(card) { const rank = parseInt(card.slice(0, -1), 10); return RANK_LABEL[rank] || String(rank); }
function cardSuit(card) { return card.slice(-1); }

function PlayingCard({ card, small, disabled, rejected, popIn, onClick }) {
    const suit = cardSuit(card);
    const sizeCls = small ? 'w-8 h-11' : 'w-12 h-16';
    return (
        <button onClick={onClick ? () => onClick(card) : undefined}
            className={`${sizeCls} rounded-md flex flex-col items-center justify-center border-2 flex-shrink-0 transition-all duration-150 ${rejected ? 'animate-[batakShake_0.4s_ease-in-out]' : ''} ${popIn ? 'animate-[cardPopIn_0.28s_ease-out]' : ''}`}
            style={{
                background: 'linear-gradient(180deg, #fffdf8 0%, #f3e8cf 100%)',
                borderColor: rejected ? '#ef4444' : '#d6c6a1',
                boxShadow: '0 2px 0 #b8a276, 0 3px 5px rgba(0,0,0,.35)',
                opacity: disabled ? 0.35 : 1, cursor: onClick ? 'pointer' : 'default',
            }}>
            <span className={`font-black leading-none ${small ? 'text-[10px]' : 'text-sm'}`} style={{ color: SUIT_COLOR[suit], textShadow: '0 1px 0 rgba(255,255,255,.5)' }}>{rankLabel(card)}</span>
            <span className={`font-black leading-none ${small ? 'text-xs' : 'text-lg'}`} style={{ color: SUIT_COLOR[suit], textShadow: '0 1px 0 rgba(255,255,255,.5)' }}>{SUIT_SYMBOL[suit]}</span>
        </button>
    );
}
function CardBack({ small }) {
    const sizeCls = small ? 'w-8 h-11' : 'w-12 h-16';
    return (
        <div className={`${sizeCls} rounded-md flex-shrink-0`} style={{
            background: 'repeating-linear-gradient(45deg, #7a1730, #7a1730 4px, #5c1024 4px, #5c1024 8px)',
            border: '1px solid #d4af37',
            boxShadow: 'inset 0 0 0 2px rgba(0,0,0,.25), 0 2px 4px rgba(0,0,0,.4)',
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

    useEffect(() => onSocket('batak:inviteSent', (data) => setInvited(prev => new Set(prev).add(data.userId))), []);

    const inviteFriend = (friendId) => getSocket()?.emit('batak:inviteFriend', { tableId, userId: friendId });
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

function BatakBoard({ tableId, myId, onExit, onActiveWagerChange }) {
    const [state, setState] = useState(null);
    const [hand, setHand] = useState([]);
    const [roundEnd, setRoundEnd] = useState(null);
    const [gameEnd, setGameEnd] = useState(null);
    const [hint, setHint] = useState('');
    const hintTimerRef = useRef(null);
    const showHint = (msg) => {
        setHint(msg);
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => setHint(''), 2400);
    };
    useEffect(() => () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); }, []);
    // Geçersiz bir kart tıklandığında o kartın kendisini de kısaca kırmızı çerçeveyle
    // titretiyoruz — sadece küçük bir metin uyarısı çoğu zaman fark edilmiyordu,
    // "kartı oynadım ama elimde kaldı" hissi tam olarak bu yüzden oluşuyordu.
    const [rejectedCard, setRejectedCard] = useState(null);
    const rejectedTimerRef = useRef(null);
    const flashRejected = (card) => {
        setRejectedCard(card);
        if (rejectedTimerRef.current) clearTimeout(rejectedTimerRef.current);
        rejectedTimerRef.current = setTimeout(() => setRejectedCard(null), 450);
    };
    useEffect(() => () => { if (rejectedTimerRef.current) clearTimeout(rejectedTimerRef.current); }, []);

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

    // Bahisli bir el aktif oynanırken (bekleme odası/oyun bitmiş değilken) üst bileşene
    // haber veriliyor ki sekme kapatma/geri gitmede uyarı gösterilebilsin.
    useEffect(() => {
        const active = !!(state && (state.betAmount > 0 || state.ratingAmount > 0) && state.phase !== 'waiting' && state.phase !== 'finished');
        onActiveWagerChange?.(active);
    }, [state?.betAmount, state?.phase, onActiveWagerChange]);
    useEffect(() => () => onActiveWagerChange?.(false), [onActiveWagerChange]);

    const leadSuit = state?.leadSuit;
    const legalCards = useMemo(() => {
        if (!leadSuit) return hand;
        const follow = hand.filter(c => cardSuit(c) === leadSuit);
        return follow.length > 0 ? follow : hand;
    }, [hand, leadSuit]);

    if (!state) return <p className="text-gray-500 text-sm text-center py-16">Masaya bağlanılıyor...</p>;

    if (state.phase === 'waiting') {
        return <WaitingRoom state={state} myId={myId} tableId={tableId} onExit={() => { getSocket()?.emit('batak:leaveTable', { tableId }); onExit(); }} />;
    }

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
        if (state.phase !== 'playing') { flashRejected(card); return showHint('Henüz kart oynama sırası değil'); }
        if (!isMyTurn) { flashRejected(card); return showHint('Sıra sende değil'); }
        if (!legalCards.includes(card)) { flashRejected(card); return showHint(`Renge uymak zorundasın — elindeki ${SUIT_SYMBOL[leadSuit]} kartlarından birini oyna.`); }
        getSocket()?.emit('batak:playCard', { tableId, card });
    };
    const goBack = () => {
        const isActiveWager = (state.betAmount > 0 || state.ratingAmount > 0) && state.phase !== 'finished';
        if (isActiveWager && !confirm(LEAVE_WARNING)) return;
        getSocket()?.emit('batak:leaveTable', { tableId });
        onExit();
    };
    const bidOptions = Array.from({ length: 13 - state.highestBid }, (_, i) => state.highestBid + 1 + i);

    return (
        <div className="max-w-3xl mx-auto">
            <style>{`
                @keyframes batakShake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
                @keyframes cardPopIn { 0% { transform: scale(0.4); opacity: 0; } 65% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
            `}</style>
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
                    <div key={seat.seat} className="flex-1 rounded-lg py-1.5 text-center border transition flex flex-col items-center gap-1"
                        style={seat.seat === activeSeat ? { backgroundColor: '#fbbf2433', borderColor: '#fbbf24' } : { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'transparent' }}>
                        <Avatar user={seat} size="xs" ring={seat.seat === activeSeat} />
                        <p className="text-[10px] font-bold truncate" style={{ color: seat.seat === activeSeat ? '#fde047' : '#fff' }}>
                            {seat.userId === myId ? 'Sen' : seat.username}{seat.seat === state.dealerIndex ? ' 🎯' : ''}{!seat.connected ? ' 🤖' : ''}
                        </p>
                        <p className="text-sm font-black" style={{ color: state.scores[seat.seat] < 0 ? '#f87171' : '#4ade80' }}>{state.scores[seat.seat]}</p>
                    </div>
                ))}
            </div>

            <div className="rounded-2xl p-3 border-4" style={{
                background: 'radial-gradient(ellipse at center, #14532d 0%, #0b3d1f 65%, #062615 100%)',
                borderColor: '#3f2a14',
                boxShadow: 'inset 0 0 30px rgba(0,0,0,.5), 0 6px 16px rgba(0,0,0,.4)',
                minHeight: 320,
            }}>
                <div className="flex flex-col items-center gap-1 mb-2">
                    <Avatar user={seatByIdx(topSeat)} size="xs" ring={topSeat === activeSeat} />
                    <p className="text-xs font-bold truncate max-w-[140px]" style={{ color: topSeat === activeSeat ? '#fde047' : '#fff' }}>{seatByIdx(topSeat).username}</p>
                    <div className="flex gap-0.5">{Array.from({ length: Math.min(seatByIdx(topSeat).handCount || 0, 5) }).map((_, i) => <CardBack key={i} small />)}</div>
                    {trickCardFor(topSeat) && <PlayingCard key={trickCardFor(topSeat)} card={trickCardFor(topSeat)} small popIn />}
                </div>
                <div className="flex items-center justify-between" style={{ minHeight: 100 }}>
                    <div className="flex flex-col items-center gap-1 w-20">
                        <Avatar user={seatByIdx(leftSeat)} size="xs" ring={leftSeat === activeSeat} />
                        <p className="text-[11px] font-bold truncate max-w-[70px]" style={{ color: leftSeat === activeSeat ? '#fde047' : '#fff' }}>{seatByIdx(leftSeat).username}</p>
                        <div className="flex flex-wrap justify-center gap-0.5">{Array.from({ length: Math.min(seatByIdx(leftSeat).handCount || 0, 5) }).map((_, i) => <CardBack key={i} small />)}</div>
                    </div>
                    <div className="flex items-center gap-1.5" style={{ minHeight: 90 }}>
                        {trickCardFor(leftSeat) && <PlayingCard key={trickCardFor(leftSeat)} card={trickCardFor(leftSeat)} small popIn />}
                        {trickCardFor(bottomSeat) && <PlayingCard key={trickCardFor(bottomSeat)} card={trickCardFor(bottomSeat)} small popIn />}
                        {trickCardFor(rightSeat) && <PlayingCard key={trickCardFor(rightSeat)} card={trickCardFor(rightSeat)} small popIn />}
                        {(!state.trick || state.trick.length === 0) && <span className="text-3xl opacity-30">🎴</span>}
                    </div>
                    <div className="flex flex-col items-center gap-1 w-20">
                        <Avatar user={seatByIdx(rightSeat)} size="xs" ring={rightSeat === activeSeat} />
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
                {hint && <p className="text-red-400 text-sm font-black mt-1 bg-red-500/10 rounded-lg py-1 mx-3">⚠️ {hint}</p>}
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
                        rejected={rejectedCard === card}
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

function BatakLobby({ myName, onMatched }) {
    const [searching, setSearching] = useState(false);
    const [queuePos, setQueuePos] = useState(null);
    const [difficulty, setDifficulty] = useState('medium');
    const [joinCode, setJoinCode] = useState('');
    const [betAmount, setBetAmount] = useState(100);
    const [ratingAmount, setRatingAmount] = useState(0);
    // undefined: bakiye/aktivite yükleniyor, null: aktivite henüz eklenmemiş, obje: eklenmiş
    const [interest, setInterest] = useState(undefined);
    const [addingActivity, setAddingActivity] = useState(false);
    const navigatedRef = useRef(false);

    const loadInterest = () => {
        api.get('/interests/my')
            .then(({ data }) => setInterest((Array.isArray(data) ? data : []).find(i => i.category === 'GAMES' && i.subCategory === 'batak') || null))
            .catch(() => setInterest(null));
    };
    useEffect(() => { loadInterest(); }, []);

    const addActivity = () => {
        setAddingActivity(true);
        api.post('/interests/add', { category: 'GAMES', subCategory: 'batak' })
            .then(loadInterest)
            .catch(() => alert('Aktivite eklenemedi, tekrar deneyin.'))
            .finally(() => setAddingActivity(false));
    };

    useEffect(() => { getSocket()?.emit('batak:setUsername', myName); }, [myName]);

    useEffect(() => {
        const offQueued = onSocket('batak:queued', (data) => setQueuePos(data.position));
        const offMatched = onSocket('batak:matched', (data) => {
            if (navigatedRef.current) return;
            navigatedRef.current = true;
            setSearching(false);
            onMatched(data.tableId);
        });
        const offErr = onSocket('batak:error', (data) => {
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
        socket.emit('batak:findMatch', { betAmount, ratingAmount });
    };
    const cancelSearch = () => { getSocket()?.emit('batak:cancelFindMatch'); setSearching(false); setQueuePos(null); };
    const startVsBots = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:playVsBots', { difficulty });
    };
    const createPrivateTable = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:createPrivateTable', { betAmount, ratingAmount });
    };
    const joinByCode = () => {
        const socket = getSocket();
        if (!socket) return alert('Bağlantı kurulamadı, tekrar deneyin.');
        if (!joinCode.trim()) return;
        socket.emit('batak:joinByCode', { code: joinCode.trim() });
    };

    if (interest === undefined) {
        return <p className="text-gray-500 text-sm text-center py-16">Yükleniyor...</p>;
    }

    if (interest === null) {
        return (
            <div className="max-w-md mx-auto">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
                    <p className="text-5xl mb-3">🃏</p>
                    <p className="text-white font-bold mb-2">Batak oynamak için önce bu oyunu aktivite olarak ekle</p>
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
                <p className="text-5xl mb-3">🃏</p>
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
                <p className="text-gray-400 text-xs font-bold mb-2">👥 Arkadaşlarınla Özel Masa</p>
                <button onClick={createPrivateTable} disabled={!canAfford} className="w-full bg-purple-600 text-white font-bold py-2.5 rounded-xl text-sm mb-3 disabled:opacity-40">
                    Özel Masa Kur ({stakeLabel} bahis)
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

const LEAVE_WARNING = 'Oyundan çıkarsan otomatik kaybetmiş sayılacaksın, puanın iade edilmeyecek. Emin misin?';

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
            <Navbar onBack={handleBack} title="Batak" />
            <div className="px-4 py-6">
                {tableId
                    ? <BatakBoard tableId={tableId} myId={myId} onExit={() => setTableId(null)} onActiveWagerChange={setActiveWager} />
                    : <BatakLobby myName={user?.fullName || user?.username || 'Oyuncu'} onMatched={setTableId} />}
            </div>
        </div>
    );
}

export default BatakPage;
