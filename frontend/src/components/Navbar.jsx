import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../store/slices/authSlice';
import { setLang } from '../store/slices/langSlice';
import { io } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

const TYPE_ICON = {
    JOIN_REQUEST:         '⚔️',
    TOURNAMENT_JOIN:      '🏆',
    MATCH_CONFIRMED:      '🎉',
    MATCH_CANCELLED:      '❌',
    FRIEND_REQUEST:       '👋',
    MESSAGE:              '💬',
    CANCELLATION_REQUEST: '⚠️',
};

const CYCLE_DURATION = 2.4; // seconds for full color cycle
const LETTER_STEP    = CYCLE_DURATION / 8; // offset between each letter

function RainbowTitle() {
    const navigate = useNavigate();
    const letters  = 'AcTiViTy'.split('');
    return (
        <>
            <style>{`
                @keyframes letterColorCycle {
                    0%     { color: #FF0000; }
                    12.5%  { color: #FF6600; }
                    25%    { color: #FFD700; }
                    37.5%  { color: #00CC00; }
                    50%    { color: #00CED1; }
                    62.5%  { color: #0099FF; }
                    75%    { color: #7B00FF; }
                    87.5%  { color: #FFFFFF; }
                    100%   { color: #FF0000; }
                }
            `}</style>
            <button onClick={() => navigate('/home')} className="text-2xl font-black tracking-tight hover:opacity-80 transition">
                {letters.map((l, i) => (
                    <span
                        key={i}
                        style={{
                            animation: `letterColorCycle ${CYCLE_DURATION}s linear infinite`,
                            animationDelay: `${-(7 - i) * LETTER_STEP}s`,
                        }}
                    >
                        {l}
                    </span>
                ))}
            </button>
        </>
    );
}

function NotificationPanel({ notifications, onMarkAll, onMarkOne, onClose }) {
    const navigate = useNavigate();

    const ADMIN_TAB_BY_TYPE = {
        VENUE_REQUEST: 'venues',
        VENUE_SUBMISSION: 'venues',
        SUBSCRIPTION_REQUEST: 'subscriptions',
        SUBSCRIPTION_RECEIPT: 'subscriptions',
        VENUE_REVIEW_PENDING: 'venue-reviews',
        REVIEW_APPEAL: 'venue-reviews',
        TOURNAMENT_PERMISSION_REQUEST: 'tournament-perms',
    };
    const OUTCOME_TYPES = new Set([
        'VENUE_APPROVED', 'VENUE_REJECTED',
        'SUBSCRIPTION_APPROVED', 'SUBSCRIPTION_REJECTED', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_WARNING',
        'TOURNAMENT_PERMISSION_APPROVED', 'TOURNAMENT_PERMISSION_REJECTED',
        'PROFILE_CHANGE_APPROVED', 'PROFILE_CHANGE_REJECTED',
        'APPEAL_RESOLVED', 'VENUE_REVIEW_APPROVED', 'VENUE_REVIEW_REJECTED', 'HOLIDAY_REMINDER',
    ]);

    const handleClick = (n) => {
        onMarkOne(n.id);
        onClose();
        const { type, data = {} } = n;
        const catPath = data.category && data.subCategory ? `/category/${data.category.toLowerCase()}/${data.subCategory}` : null;

        if (type === 'MESSAGE') {
            navigate(data.senderId ? `/messages/${data.senderId}` : '/messages');
        } else if (['FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'FOLLOW_REQUEST', 'FOLLOW_ACCEPTED'].includes(type)) {
            navigate(data.senderId ? `/profile/${data.senderId}` : '/profile');
        } else if (ADMIN_TAB_BY_TYPE[type]) {
            navigate(`/admin?tab=${ADMIN_TAB_BY_TYPE[type]}`);
        } else if (type?.startsWith('TOURNAMENT') && data.tournamentId && catPath) {
            navigate(`${catPath}?manageTournament=${data.tournamentId}`);
        } else if (catPath) {
            navigate(catPath);
        } else if (data.rivalId) {
            navigate('/category/sports/football');
        } else if (OUTCOME_TYPES.has(type)) {
            navigate('/profile');
        }
    };

    return (
        <div className="absolute right-0 top-10 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <h3 className="text-white font-bold text-sm">Notifications</h3>
                <button onClick={onMarkAll} className="text-purple-400 hover:text-purple-300 text-xs transition">
                    Mark all read
                </button>
            </div>
            <div className="max-h-[min(24rem,70vh)] overflow-y-auto">
                {notifications.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">No notifications yet.</p>
                ) : (
                    notifications.map(n => (
                        <button
                            key={n.id}
                            onClick={() => handleClick(n)}
                            className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-800 transition text-left border-b border-gray-800/50 ${!n.read ? 'bg-purple-600/5' : ''}`}
                        >
                            <span className="text-xl flex-shrink-0 mt-0.5">{TYPE_ICON[n.type] || '🔔'}</span>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold ${!n.read ? 'text-white' : 'text-gray-300'}`}>{n.title}</p>
                                <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{n.body}</p>
                                <p className="text-gray-700 text-[10px] mt-1">
                                    {new Date(n.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                    {' · '}
                                    {new Date(n.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                                </p>
                            </div>
                            {!n.read && <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0 mt-1.5" />}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}

const NAV_BTN = 'flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg transition';

export default function Navbar({ onBack, backLabel, title }) {
    const navigate  = useNavigate();
    const location  = useLocation();
    const dispatch  = useDispatch();
    const user      = useSelector(state => state.auth.user);
    const lang      = useSelector(state => state.lang.lang);
    const { t, i18n } = useTranslation();

    const [unread, setUnread]             = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [panelOpen, setPanelOpen]       = useState(false);
    const [menuOpen, setMenuOpen]         = useState(false);
    const bellRef = useRef(null);
    const menuRef = useRef(null);

    const myId = user?.id || (() => {
        try {
            const token = localStorage.getItem('activity_token');
            return token ? JSON.parse(atob(token.split('.')[1])).userId : null;
        } catch { return null; }
    })();

    useEffect(() => {
        api.get('/notifications').then(({ data }) => {
            setNotifications(data.notifications);
            setUnread(data.unreadCount);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (!myId) return;
        const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
        const socket = io(socketUrl, { auth: { userId: myId } });
        socket.on('notification', (notif) => {
            setNotifications(prev => [notif, ...prev]);
            setUnread(prev => prev + 1);
        });
        return () => socket.disconnect();
    }, [myId]);

    useEffect(() => {
        if (!panelOpen) return;
        const handler = (e) => {
            if (bellRef.current && !bellRef.current.contains(e.target)) setPanelOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [panelOpen]);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const handleMarkAll = async () => {
        await api.patch('/notifications/read-all').catch(() => {});
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnread(0);
    };

    const handleMarkOne = async (id) => {
        await api.patch(`/notifications/${id}/read`).catch(() => {});
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        setUnread(prev => Math.max(0, prev - 1));
    };

    const handleBellClick = () => {
        setPanelOpen(v => !v);
        if (!panelOpen && unread > 0) handleMarkAll();
    };

    return (
        <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3 sticky top-0 z-20">
            <div className="w-full flex items-center">

                {/* LEFT — 3-dot menu */}
                <div className="flex items-center gap-2 flex-1">
                    {onBack && (
                        <button onClick={onBack} className={`${NAV_BTN} border-gray-600 hover:border-gray-500`}>
                            <span>←</span>
                            <span className="hidden sm:inline">{backLabel || t('nav.back')}</span>
                        </button>
                    )}

                    {user?.isAdmin && (
                        location.pathname.startsWith('/admin') ? (
                            <button onClick={() => navigate('/home')} className={`${NAV_BTN} border-purple-600 text-purple-300 hover:text-purple-200`}>
                                <span>←</span>
                                <span className="hidden sm:inline">{t('nav.back_to_app', { defaultValue: 'Uygulamaya Dön' })}</span>
                            </button>
                        ) : (
                            <button onClick={() => navigate('/admin')} className={`${NAV_BTN} border-purple-600 text-purple-300 hover:text-purple-200`}>
                                <span>👑</span>
                                <span className="hidden sm:inline">{t('nav.admin')}</span>
                            </button>
                        )
                    )}

                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={() => setMenuOpen(v => !v)}
                            className={`${NAV_BTN} text-base leading-none px-3`}
                        >
                            ⋮
                        </button>

                        {menuOpen && (
                            <div className="absolute left-0 top-10 w-48 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-50 overflow-hidden">
                                <button
                                    onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition text-left"
                                >
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                                        {user?.username?.[0]?.toUpperCase() || '?'}
                                    </div>
                                    <span className="text-white text-sm font-bold">{user?.username || t('nav.profile')}</span>
                                </button>

                                <div className="border-t border-gray-800" />

                                <button
                                    onClick={() => { setMenuOpen(false); navigate('/messages'); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition text-left"
                                >
                                    <span className="text-lg">💬</span>
                                    <span className="text-gray-300 text-sm font-bold">{t('nav.messages')}</span>
                                </button>

                                <div className="border-t border-gray-800" />

                                <button
                                    onClick={() => { const nl = lang === 'en' ? 'tr' : 'en'; dispatch(setLang(nl)); i18n.changeLanguage(nl); setMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition text-left"
                                >
                                    <span className="text-lg">{lang === 'en' ? '🇬🇧' : '🇹🇷'}</span>
                                    <span className="text-gray-300 text-sm font-bold">{lang === 'en' ? 'EN → TR' : 'TR → EN'}</span>
                                </button>

                                <div className="border-t border-gray-800" />

                                <button
                                    onClick={() => { setMenuOpen(false); dispatch(logout()); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition text-left"
                                >
                                    <span className="text-lg">🚪</span>
                                    <span className="text-red-400 text-sm font-bold">{t('nav.logout')}</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* CENTER — App name */}
                <div className="flex flex-col items-center">
                    <RainbowTitle />
                    {title && <span className="text-gray-500 text-[10px] font-bold -mt-0.5">{title}</span>}
                </div>

                {/* RIGHT — Notifications bell */}
                <div className="flex items-center gap-2 flex-1 justify-end">
                    <div className="relative" ref={bellRef}>
                        <button onClick={handleBellClick} className={`${NAV_BTN} relative`}>
                            <span>🔔</span>
                            {unread > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center leading-none">
                                    {unread > 9 ? '9+' : unread}
                                </span>
                            )}
                        </button>
                        {panelOpen && (
                            <NotificationPanel
                                notifications={notifications}
                                onMarkAll={handleMarkAll}
                                onMarkOne={handleMarkOne}
                                onClose={() => setPanelOpen(false)}
                            />
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}
