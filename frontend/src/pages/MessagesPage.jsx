import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../services/api';
import Navbar from '../components/Navbar';

function Avatar({ user, size = 'md', color = 'from-purple-500 to-blue-500' }) {
    const sizes = { sm: 'w-8 h-8 text-sm', md: 'w-10 h-10 text-base', lg: 'w-12 h-12 text-lg' };
    if (user?.avatar) {
        return <img src={user.avatar} alt={user.username} className={`${sizes[size]} rounded-full object-cover flex-shrink-0`} />;
    }
    return (
        <div className={`${sizes[size]} rounded-full bg-gradient-to-b ${color} flex items-center justify-center text-white font-bold flex-shrink-0`}>
            {user?.username?.[0]?.toUpperCase() || '?'}
        </div>
    );
}

function ConversationList({ conversations, activeId, onSelect, myId }) {
    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                    <div className="text-center py-12 px-4">
                        <p className="text-4xl mb-3">💬</p>
                        <p className="text-gray-500 text-sm">No conversations yet.</p>
                        <p className="text-gray-600 text-xs mt-1">Add friends and start chatting!</p>
                    </div>
                ) : (
                    conversations.map(conv => {
                        const other = conv.other;
                        const last = conv.lastMessage;
                        const isActive = conv.id === activeId;
                        return (
                            <button
                                key={conv.id}
                                onClick={() => onSelect(conv)}
                                className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-800 transition text-left border-b border-gray-800/50 ${isActive ? 'bg-gray-800' : ''}`}
                            >
                                <Avatar user={other} size="md" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <p className="text-white font-bold text-sm truncate">{other?.fullName || other?.username}</p>
                                        {last && (
                                            <p className="text-gray-600 text-xs flex-shrink-0 ml-2">
                                                {new Date(last.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        )}
                                    </div>
                                    <p className="text-gray-500 text-xs truncate mt-0.5">
                                        {last ? (last.senderId === myId ? 'You: ' : '') + last.content : 'No messages yet'}
                                    </p>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}

function ChatView({ conversation, myId, onBack, onBlocked, isBlocked = false }) {
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [blocking, setBlocking] = useState(false);
    const bottomRef = useRef(null);
    const other = conversation.other;

    useEffect(() => {
        const fetchMessages = async () => {
            setIsLoading(true);
            try {
                const { data } = await api.get(`/messages/conversation/${conversation.id}/messages`);
                setMessages(data);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchMessages();
    }, [conversation.id]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;
        setIsSending(true);
        try {
            const { data } = await api.post(`/messages/send/${other.id}`, { content: input.trim() });
            setMessages(prev => [...prev, data.message]);
            setInput('');
        } catch (err) {
            console.error(err);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Chat Header */}
            <div className="px-4 py-3.5 border-b border-gray-800 flex items-center gap-3 flex-shrink-0 bg-gray-900">
                <button onClick={onBack} className="text-gray-400 hover:text-white transition md:hidden">←</button>
                <Avatar user={other} size="md" />
                <div className="flex-1 cursor-pointer" onClick={() => navigate(`/profile/${other?.id}`)}>
                    <p className="text-white font-bold text-sm hover:text-purple-300 transition">{other?.fullName || other?.username}</p>
                    <p className="text-gray-500 text-xs">@{other?.username}</p>
                </div>
                <button
                    onClick={async () => {
                        if (!window.confirm(`Block @${other?.username}? They won't be able to message you.`)) return;
                        setBlocking(true);
                        try {
                            await api.post(`/friends/block/${other?.id}`);
                            onBlocked(other?.id);
                        } catch (err) {
                            console.error(err);
                        } finally {
                            setBlocking(false);
                        }
                    }}
                    disabled={blocking}
                    className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold px-3 py-1.5 rounded-lg transition disabled:opacity-50 flex-shrink-0"
                >
                    🚫 {blocking ? '...' : 'Block'}
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {isLoading ? (
                    <p className="text-gray-500 text-center text-sm py-8">Loading...</p>
                ) : messages.length === 0 ? (
                    <div className="text-center py-12">
                        <Avatar user={other} size="lg" />
                        <p className="text-gray-400 font-bold mt-3">{other?.fullName || other?.username}</p>
                        <p className="text-gray-600 text-sm mt-1">Say hello! 👋</p>
                    </div>
                ) : (
                    messages.map(msg => {
                        const isMe = msg.senderId === myId;
                        const listing = msg.equipmentListing;
                        return (
                            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                {!isMe && <Avatar user={msg.sender} size="sm" />}
                                <div className={`flex flex-col gap-1 max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMe ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-br-sm' : 'bg-gray-800 text-gray-100 rounded-bl-sm'}`}>
                                        {msg.content}
                                        <p className={`text-xs mt-1 ${isMe ? 'text-purple-200' : 'text-gray-500'}`}>
                                            {new Date(msg.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    {listing && (
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/category/${listing.category?.toLowerCase()}/${listing.subCategory}?tab=equipment&openEquipmentId=${listing.id}`)}
                                            className="flex items-center gap-2.5 bg-gray-800/80 hover:bg-gray-800 border border-gray-700 rounded-xl px-2.5 py-2 w-full transition text-left"
                                        >
                                            {listing.images?.[0] ? (
                                                <img src={listing.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center text-lg flex-shrink-0">🎾</div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-white text-xs font-bold truncate">{listing.title}</p>
                                                <p className="text-green-400 text-xs font-bold">
                                                    {listing.price}₺{listing.status === 'SOLD' ? ' · Sold' : ''}
                                                </p>
                                            </div>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input / Blocked notice */}
            {isBlocked ? (
                <div className="px-4 py-3 border-t border-gray-800 flex-shrink-0 bg-red-500/5">
                    <p className="text-red-400 text-xs text-center font-bold">
                        🚫 You blocked this user — unblock to send messages
                    </p>
                </div>
            ) : (
                <div className="px-4 py-3 border-t border-gray-800 flex gap-2 flex-shrink-0">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                        placeholder="Type a message..."
                        className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                    />
                    <button
                        onClick={handleSend}
                        disabled={isSending || !input.trim()}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50 hover:opacity-90 transition"
                    >
                        {isSending ? '...' : '➤'}
                    </button>
                </div>
            )}
        </div>
    );
}

function MessagesPage() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const myId = useSelector(state => state.auth.user?.id);

    const [conversations, setConversations] = useState([]);
    const [activeConv, setActiveConv] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [showBlocked, setShowBlocked] = useState(false);
    const [unblocking, setUnblocking] = useState(null);

    const [blockedIds, setBlockedIds] = useState(new Set());

    // Kullanıcı isteği: destek mesajları artık konu (subject) bazlı ayrı sohbetler — her
    // başlatılan sohbet kendi konusuyla bir kutu, tıklayınca sadece o konunun mesajlaşması açılır.
    const [supportOpen, setSupportOpen] = useState(false);
    const [supportView, setSupportView] = useState('list'); // 'list' | 'thread'
    const [supportTickets, setSupportTickets] = useState([]);
    const [supportLoading, setSupportLoading] = useState(false);
    const [activeTicket, setActiveTicket] = useState(null);
    const [ticketMessages, setTicketMessages] = useState([]);
    const [loadingTicketMessages, setLoadingTicketMessages] = useState(false);
    const [supportText, setSupportText] = useState('');
    const [supportSending, setSupportSending] = useState(false);
    const [newSubject, setNewSubject] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [creatingTicket, setCreatingTicket] = useState(false);

    const loadSupportTickets = () => {
        setSupportLoading(true);
        api.get('/users/me/support-tickets')
            .then(({ data }) => setSupportTickets(Array.isArray(data) ? data : []))
            .catch(() => setSupportTickets([]))
            .finally(() => setSupportLoading(false));
    };

    const openSupport = () => { setSupportOpen(true); setSupportView('list'); loadSupportTickets(); };

    const openTicket = (ticket) => {
        setActiveTicket(ticket);
        setSupportView('thread');
        setLoadingTicketMessages(true);
        api.get(`/users/me/support-tickets/${ticket.id}/messages`)
            .then(({ data }) => setTicketMessages(Array.isArray(data.messages) ? data.messages : []))
            .catch(() => setTicketMessages([]))
            .finally(() => setLoadingTicketMessages(false));
    };

    const createTicket = async () => {
        const subject = newSubject.trim();
        const message = newMessage.trim();
        if (!subject || !message) return;
        setCreatingTicket(true);
        try {
            const { data } = await api.post('/users/me/support-tickets', { subject, message });
            setNewSubject('');
            setNewMessage('');
            setSupportTickets(prev => [{ id: data.id, subject: data.subject, status: data.status, updatedAt: data.updatedAt, lastMessage: data.messages?.[0] || null, hasNewReply: false }, ...prev]);
            openTicket(data);
        } catch (err) {
            alert(err?.response?.data?.message || 'Konu oluşturulamadı');
        } finally {
            setCreatingTicket(false);
        }
    };

    const sendSupportMessage = async () => {
        if (!supportText.trim() || !activeTicket) return;
        setSupportSending(true);
        try {
            const { data } = await api.post(`/users/me/support-tickets/${activeTicket.id}/messages`, { message: supportText.trim() });
            setTicketMessages(prev => [...prev, data]);
            setSupportText('');
        } catch (err) {
            alert(err?.response?.data?.message || 'Mesaj gönderilemedi');
        } finally {
            setSupportSending(false);
        }
    };

    useEffect(() => {
        api.get('/friends/blocked').then(({ data }) => {
            setBlockedUsers(data);
            setBlockedIds(new Set(data.map(u => u.id)));
        }).catch(() => {});
    }, []);

    const handleBlocked = (blockedId) => {
        const user = conversations.find(c => c.other?.id === blockedId)?.other;
        setBlockedUsers(prev => user && !prev.find(u => u.id === blockedId) ? [...prev, user] : prev);
        setBlockedIds(prev => new Set([...prev, blockedId]));
        // keep conversation visible but switch tab to blocked
        setShowBlocked(true);
    };

    const handleUnblock = async (blockedUser) => {
        setUnblocking(blockedUser.id);
        try {
            await api.delete(`/friends/block/${blockedUser.id}`);
            setBlockedUsers(prev => prev.filter(u => u.id !== blockedUser.id));
            setBlockedIds(prev => { const s = new Set(prev); s.delete(blockedUser.id); return s; });
            if (activeConv?.other?.id === blockedUser.id) setActiveConv(null);
        } catch (err) {
            console.error(err);
        } finally {
            setUnblocking(null);
        }
    };

    const handleOpenBlockedChat = (blockedUser) => {
        const conv = conversations.find(c => c.other?.id === blockedUser.id);
        if (conv) {
            setActiveConv(conv);
        } else {
            // Synthetic conv to view history
            setActiveConv({ id: `blocked-${blockedUser.id}`, other: blockedUser, lastMessage: null });
        }
    };

    useEffect(() => {
        const fetchConversations = async () => {
            try {
                const { data } = await api.get('/messages/conversations');
                const blocked = await api.get('/friends/blocked').then(r => new Set(r.data.map(u => u.id))).catch(() => new Set());
                setConversations(data.filter(c => !blocked.has(c.other?.id)));

                if (userId) {
                    // Open or create conversation with this user
                    const existing = data.find(c => c.other?.id === userId);
                    if (existing) {
                        setActiveConv(existing);
                    } else {
                        const { data: conv } = await api.get(`/messages/conversation/${userId}`);
                        const enriched = {
                            ...conv,
                            other: conv.user1Id === myId ? conv.user2 : conv.user1,
                            lastMessage: null,
                        };
                        setConversations(prev => [enriched, ...prev]);
                        setActiveConv(enriched);
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchConversations();
    }, [userId, myId]);

    const handleSelectConv = (conv) => {
        setActiveConv(conv);
        navigate(`/messages/${conv.other?.id}`, { replace: true });
    };

    const showList = !activeConv;

    return (
        <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
            <Navbar />

            {/* Full-width chat layout */}
            <div className="flex-1 flex overflow-hidden">

                {/* Conversation List + Blocked toggle */}
                <div className={`w-80 border-r border-gray-800 flex-shrink-0 flex flex-col bg-gray-900 ${activeConv ? 'hidden md:flex' : 'flex'}`}>
                    {/* Tab switcher */}
                    <div className="flex border-b border-gray-800 flex-shrink-0">
                        <button
                            onClick={() => setShowBlocked(false)}
                            className={`flex-1 py-3 text-xs font-bold transition ${!showBlocked ? 'text-white border-b-2 border-purple-500' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            💬 Messages
                        </button>
                        <button
                            onClick={() => setShowBlocked(true)}
                            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-1 ${showBlocked ? 'text-white border-b-2 border-red-500' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            🚫 Blocked {blockedUsers.length > 0 && <span className="bg-red-500/20 text-red-400 text-[10px] px-1.5 rounded-full">{blockedUsers.length}</span>}
                        </button>
                        <button
                            onClick={openSupport}
                            title="Destek"
                            className="px-3 py-3 text-xs font-bold text-gray-500 hover:text-purple-300 transition shrink-0 border-l border-gray-800"
                        >
                            🆘 Destek
                        </button>
                    </div>
                    {/* Messages list */}
                    {!showBlocked && (
                        isLoading ? (
                            <p className="text-gray-500 text-center py-16 text-sm">Loading...</p>
                        ) : (
                            <ConversationList
                                conversations={conversations}
                                activeId={activeConv?.id}
                                onSelect={handleSelectConv}
                                myId={myId}
                            />
                        )
                    )}

                    {/* Blocked list */}
                    {showBlocked && (
                        <div className="flex-1 overflow-y-auto">
                            {blockedUsers.length === 0 ? (
                                <div className="text-center py-12 px-4">
                                    <p className="text-3xl mb-2">🚫</p>
                                    <p className="text-gray-500 text-sm">No blocked users.</p>
                                </div>
                            ) : (
                                blockedUsers.map(u => (
                                    <div key={u.id}
                                        onClick={() => handleOpenBlockedChat(u)}
                                        className={`flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/50 transition cursor-pointer ${activeConv?.other?.id === u.id ? 'bg-gray-800' : ''}`}
                                    >
                                        <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-sm font-bold flex-shrink-0">
                                            {u.username?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-gray-300 text-sm font-bold truncate">{u.fullName || u.username}</p>
                                            <p className="text-gray-600 text-xs">@{u.username}</p>
                                        </div>
                                        <button
                                            onClick={e => { e.stopPropagation(); handleUnblock(u); }}
                                            disabled={unblocking === u.id}
                                            className="text-xs text-green-500 hover:text-green-400 font-bold flex-shrink-0 disabled:opacity-50 transition bg-green-500/10 hover:bg-green-500/20 px-2.5 py-1 rounded-lg"
                                        >
                                            {unblocking === u.id ? '...' : 'Unblock'}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Chat Area */}
                <div className={`flex-1 flex flex-col overflow-hidden ${!activeConv ? 'hidden md:flex' : 'flex'}`}>
                    {activeConv ? (
                        <ChatView
                            conversation={activeConv}
                            myId={myId}
                            isBlocked={blockedIds.has(activeConv?.other?.id)}
                            onBlocked={handleBlocked}
                            onBack={() => {
                                setActiveConv(null);
                                navigate('/messages', { replace: true });
                            }}
                        />
                    ) : (
                        <div className="flex-1 flex items-center justify-center bg-gray-950">
                            <div className="text-center">
                                <p className="text-6xl mb-4">💬</p>
                                <p className="text-gray-400 font-bold text-lg">Select a conversation</p>
                                <p className="text-gray-600 text-sm mt-1">Choose someone from the list to start chatting</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {supportOpen && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setSupportOpen(false)}>
                    <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4 shrink-0">
                            {supportView === 'thread' ? (
                                <button onClick={() => setSupportView('list')} className="flex items-center gap-2 text-white font-bold text-lg min-w-0">
                                    <span className="text-gray-400">‹</span>
                                    <span className="truncate">{activeTicket?.subject}</span>
                                </button>
                            ) : (
                                <h3 className="text-white font-bold text-lg">💬 Admine Destek</h3>
                            )}
                            <button onClick={() => setSupportOpen(false)} className="text-gray-400 hover:text-white text-xl shrink-0">✕</button>
                        </div>

                        {supportView === 'list' ? (
                            <>
                                {/* Kullanıcı isteği: yeni bir sohbet başlatırken konu + mesaj birlikte
                                    girilsin, gönderince o konunun adıyla bir sohbet kutusu oluşsun. */}
                                <div className="bg-gray-800 rounded-xl p-3 border border-gray-700 mb-3 shrink-0">
                                    <p className="text-gray-400 text-xs font-bold mb-2">+ Yeni Konu</p>
                                    <input
                                        value={newSubject}
                                        onChange={e => setNewSubject(e.target.value)}
                                        placeholder="Konu (örn. Ödeme sorunu)"
                                        className="w-full bg-gray-900 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm mb-2"
                                    />
                                    <textarea
                                        value={newMessage}
                                        onChange={e => setNewMessage(e.target.value)}
                                        placeholder="Mesajınızı yazın..."
                                        rows={2}
                                        className="w-full bg-gray-900 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 resize-none text-sm mb-2"
                                    />
                                    <button
                                        onClick={createTicket}
                                        disabled={!newSubject.trim() || !newMessage.trim() || creatingTicket}
                                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2 rounded-lg disabled:opacity-40 transition hover:opacity-90 text-sm"
                                    >
                                        {creatingTicket ? 'Gönderiliyor...' : 'Gönder'}
                                    </button>
                                </div>

                                <div className="overflow-y-auto space-y-2" style={{ maxHeight: '18rem' }}>
                                    {supportLoading ? (
                                        <p className="text-gray-500 text-sm text-center py-6">Yükleniyor...</p>
                                    ) : supportTickets.length === 0 ? (
                                        <p className="text-gray-500 text-sm text-center py-6">Henüz bir destek konunuz yok.</p>
                                    ) : (
                                        supportTickets.map(t => (
                                            <button key={t.id} onClick={() => openTicket(t)}
                                                className={`w-full text-left bg-gray-800 rounded-xl p-3 border ${t.hasNewReply ? 'border-purple-500' : 'border-gray-700'} hover:border-purple-500 transition`}>
                                                <div className="flex justify-between items-center gap-2">
                                                    <p className="text-white text-sm font-bold truncate">💬 {t.subject}</p>
                                                    {t.hasNewReply && <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />}
                                                </div>
                                                {t.lastMessage && (
                                                    <p className="text-gray-400 text-xs mt-1 truncate">{t.lastMessage.isFromAdmin ? 'Admin: ' : ''}{t.lastMessage.message}</p>
                                                )}
                                                {t.status === 'CLOSED' && <p className="text-gray-600 text-[10px] mt-1">Kapatıldı</p>}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="overflow-y-auto mb-3 space-y-2 flex-1" style={{ maxHeight: '20rem' }}>
                                    {loadingTicketMessages ? (
                                        <p className="text-gray-500 text-sm text-center py-6">Yükleniyor...</p>
                                    ) : (
                                        ticketMessages.map(m => (
                                            <div key={m.id} className={`rounded-xl p-3 border max-w-[85%] ${m.isFromAdmin ? 'bg-gray-800 border-gray-700 ml-0' : 'bg-purple-600/20 border-purple-500/40 ml-auto'}`}>
                                                {m.isFromAdmin && <p className="text-purple-400 text-[10px] font-bold mb-0.5">Admin</p>}
                                                <p className="text-white text-sm">{m.message}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                                {activeTicket?.status !== 'CLOSED' && (
                                    <>
                                        <textarea
                                            value={supportText}
                                            onChange={e => setSupportText(e.target.value)}
                                            placeholder="Yanıt yaz..."
                                            rows={2}
                                            className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 resize-none text-sm shrink-0"
                                        />
                                        <button
                                            onClick={sendSupportMessage}
                                            disabled={!supportText.trim() || supportSending}
                                            className="mt-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-40 transition hover:opacity-90 shrink-0"
                                        >
                                            {supportSending ? 'Gönderiliyor...' : 'Gönder'}
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default MessagesPage;
