import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import api from '../services/api';
import Navbar from '../components/Navbar';
import NotificationSettingsModal from '../components/NotificationSettingsModal';
import { TYPE_ICON, resolveNotificationPath } from '../utils/notifNav';

const SCORE_HINT_TYPE = 'SCORE_ENTRY_REQUIRED';
const LOCALE = { tr: 'tr-TR', en: 'en-GB', ru: 'ru-RU', de: 'de-DE' };

export default function NotificationsPage() {
    const { t, i18n } = useTranslation();
    const n = (k) => t(`notif.${k}`);
    const navigate = useNavigate();
    const user = useSelector(state => state.auth.user);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasPendingScore, setHasPendingScore] = useState(false);
    const [subNames, setSubNames] = useState({});
    const [settingsOpen, setSettingsOpen] = useState(false);
    const rowRefs = useRef({});

    const refreshPendingScore = useCallback(() => {
        api.get('/rivals/my-pending-score-count')
            .then(({ data }) => setHasPendingScore((data?.pendingScoreCount || 0) > 0))
            .catch(() => {});
    }, []);

    useEffect(() => {
        api.get('/notifications')
            .then(({ data }) => setNotifications(data.notifications || []))
            .catch(() => {})
            .finally(() => setLoading(false));
        refreshPendingScore();
        api.get('/interests/categories').then(({ data }) => {
            const map = {};
            for (const c of data.categories || []) for (const s of c.subCategories || []) map[s.id] = s.name;
            setSubNames(map);
        }).catch(() => {});
    }, [refreshPendingScore]);

    useEffect(() => {
        if (!user?.id) return;
        const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
        const socket = io(socketUrl, { auth: { userId: user.id } });
        // id'siz yayınlar (bazı toplu event'ler) listeye hayalet satır olarak girmesin
        socket.on('notification', (notif) => {
            if (!notif?.id) return;
            setNotifications(prev => prev.some(x => x.id === notif.id)
                ? prev
                : [{ ...notif, read: false, createdAt: notif.createdAt || new Date().toISOString() }, ...prev]);
        });
        // Skor girilince ilgili SCORE_ENTRY_REQUIRED satırı sayfa yenilemeden okundu olsun
        socket.on('notificationRead', (payload) => {
            if (!payload?.id) return;
            setNotifications(prev => prev.map(x => x.id === payload.id ? { ...x, read: true } : x));
            if (payload.type === SCORE_HINT_TYPE) { setHasPendingScore(false); refreshPendingScore(); }
        });
        return () => socket.disconnect();
    }, [user?.id, refreshPendingScore]);

    const setRead = async (id, read) => {
        setNotifications(prev => prev.map(x => x.id === id ? { ...x, read } : x));
        try {
            await api.patch(`/notifications/${id}/read`, { read });
        } catch {
            setNotifications(prev => prev.map(x => x.id === id ? { ...x, read: !read } : x));
        }
    };

    const markAll = async () => {
        setNotifications(prev => prev.map(x => ({ ...x, read: true })));
        await api.patch('/notifications/read-all').catch(() => {});
    };

    const openNotif = async (item) => {
        if (!item.read) setRead(item.id, true);
        const path = await resolveNotificationPath(item, { isBusiness: !!user?.isBusiness });
        if (path) navigate(path);
    };

    const scoreTarget = useMemo(
        () => (hasPendingScore ? notifications.find(x => x.type === SCORE_HINT_TYPE) : null),
        [notifications, hasPendingScore],
    );
    const unreadCount = notifications.filter(x => !x.read).length;
    const locale = LOCALE[i18n.language] || 'en-GB';

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <style>{`@keyframes notifBlink { 0%,100% { opacity: 1 } 50% { opacity: .25 } }`}</style>
            <Navbar onBack={() => navigate(-1)} title={n('notificationsTitle')} />

            <div className="max-w-2xl mx-auto px-4 py-5">
                <div className="flex items-center justify-between gap-2 mb-4">
                    <h1 className="text-xl font-black">
                        🔔 {n('notificationsTitle')}
                        {unreadCount > 0 && <span className="ml-2 text-xs bg-red-500 text-white rounded-full px-2 py-0.5 align-middle">{unreadCount}</span>}
                    </h1>
                    <div className="flex gap-2">
                        {unreadCount > 0 && (
                            <button onClick={markAll}
                                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-purple-300 text-xs font-bold px-3 py-1.5 rounded-lg transition">
                                ✓ {n('markAllRead')}
                            </button>
                        )}
                        <button onClick={() => setSettingsOpen(true)}
                            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-bold px-3 py-1.5 rounded-lg transition">
                            ⚙️ {n('notifSettingsBtn')}
                        </button>
                    </div>
                </div>

                {scoreTarget && (
                    <button
                        onClick={() => rowRefs.current[scoreTarget.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        style={{ animation: 'notifBlink 1s ease-in-out infinite' }}
                        className="w-full mb-3 bg-amber-500/15 border border-amber-500/50 text-amber-300 text-xs font-bold py-2 rounded-xl"
                    >
                        📝 {n('notifScoreScrollDown')} ↓
                    </button>
                )}

                {loading ? (
                    <p className="text-gray-500 text-sm text-center py-16">{t('common.loading')}</p>
                ) : notifications.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-16">{n('noNotificationsText')}</p>
                ) : (
                    <div className="space-y-2">
                        {notifications.map(item => {
                            const blinking = scoreTarget?.id === item.id;
                            const subLabel = item.data?.subCategory ? (subNames[item.data.subCategory] || item.data.subCategory) : null;
                            return (
                                <div key={item.id} ref={el => { rowRefs.current[item.id] = el; }}
                                    className={`flex items-start gap-3 p-3 rounded-2xl border transition ${blinking ? 'border-amber-500/70 bg-amber-500/5' : !item.read ? 'border-purple-500/30 bg-purple-600/5' : 'border-gray-800 bg-gray-900'}`}>
                                    <button onClick={() => openNotif(item)} className="flex-1 flex items-start gap-3 text-left min-w-0"
                                        style={blinking ? { animation: 'notifBlink 1s ease-in-out infinite' } : undefined}>
                                        <span className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-xl flex-shrink-0">
                                            {TYPE_ICON[item.type] || '🔔'}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className={`block text-sm font-bold ${!item.read ? 'text-white' : 'text-gray-300'}`}>{item.title}</span>
                                            <span className="block text-gray-500 text-xs mt-0.5 line-clamp-2">{item.body}</span>
                                            <span className="block text-gray-600 text-[10px] mt-1">
                                                {new Date(item.createdAt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </span>
                                    </button>
                                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                        {!item.read && <span className="w-2 h-2 rounded-full bg-purple-500" />}
                                        {subLabel && (
                                            <span className="text-[10px] font-bold text-purple-300 bg-purple-600/15 border border-purple-500/30 rounded-full px-2 py-0.5 max-w-[110px] truncate">
                                                {subLabel}
                                            </span>
                                        )}
                                        <button onClick={() => setRead(item.id, !item.read)}
                                            className={`text-[10px] font-bold rounded-full px-2 py-0.5 border transition ${item.read ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-gray-600 text-gray-400 bg-gray-800'}`}>
                                            {item.read ? n('notifReadBtn') : n('notifUnreadBtn')}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <NotificationSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
    );
}
