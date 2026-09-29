import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { setUser } from '../store/slices/authSlice';
import ActivityAlertModal from './ActivityAlertModal';

const CHANNELS = [
    { value: null, icon: '🚫' },
    { value: 'WHATSAPP', icon: '💬' },
    { value: 'TELEGRAM', icon: '✈️' },
    { value: 'SMS', icon: '📩' },
    { value: 'EMAIL', icon: '✉️' },
];

function Toggle({ on, busy, onClick }) {
    return (
        <button onClick={onClick} disabled={busy}
            className={`w-12 h-7 rounded-full border transition relative flex-shrink-0 disabled:opacity-60 ${on ? 'bg-purple-600/60 border-purple-500' : 'bg-gray-800 border-gray-700'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full transition ${on ? 'right-0.5 bg-purple-400' : 'left-0.5 bg-gray-500'}`} />
        </button>
    );
}

// Ek bildirim kanalı — Telegram diğerlerinden farklı: bot rastgele bir numarayı
// mesajlayamaz, önce hesabın bota bağlanması gerekir.
function ExtraChannelModal({ user, onClose, onSaved }) {
    const { t } = useTranslation();
    const n = (k) => t(`notif.${k}`);
    const [channel, setChannel] = useState(user?.extraNotifyChannel || null);
    const [phone, setPhone] = useState(user?.extraNotifyPhone || '');
    const [email, setEmail] = useState(user?.extraNotifyEmail || '');
    const [saving, setSaving] = useState(false);
    const [linking, setLinking] = useState(false);
    const [telegramLinked, setTelegramLinked] = useState(!!user?.telegramLinked);

    const fail = (e) => alert(e?.response?.data?.message || n('actionFailed'));

    const save = async () => {
        setSaving(true);
        try {
            const { data } = await api.patch('/users/me/notify-channel', { channel, phone, email });
            onSaved(data);
            onClose();
        } catch (e) { fail(e); }
        setSaving(false);
    };

    const linkTelegram = async () => {
        setLinking(true);
        try {
            const { data } = await api.post('/telegram/link-token');
            if (!data.botConfigured || !data.deepLink) alert(n('extraNotifyTelegramNotReady'));
            else window.open(data.deepLink, '_blank', 'noopener');
        } catch (e) { fail(e); }
        setLinking(false);
    };

    const unlinkTelegram = async () => {
        setLinking(true);
        try {
            await api.post('/telegram/unlink');
            setTelegramLinked(false);
            onSaved({ telegramLinked: false });
        } catch (e) { fail(e); }
        setLinking(false);
    };

    const INPUT = 'w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500';

    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white font-black text-lg">{n('extraNotifyTitle')}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                </div>
                <p className="text-gray-500 text-xs leading-relaxed mb-3">{n('extraNotifyDesc')}</p>

                <div className="space-y-2">
                    {CHANNELS.map(c => {
                        const active = channel === c.value;
                        return (
                            <button key={c.value || 'off'} onClick={() => setChannel(c.value)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition text-left ${active ? 'bg-purple-600/15 border-purple-500' : 'bg-gray-900 border-gray-800 hover:border-gray-700'}`}>
                                <span className="text-lg">{c.icon}</span>
                                <span className={`flex-1 text-sm font-bold ${active ? 'text-purple-300' : 'text-white'}`}>
                                    {c.value ? n(`extraNotify_${c.value}`) : n('extraNotifyOff')}
                                </span>
                                {active && <span className="text-purple-300 font-black">✓</span>}
                            </button>
                        );
                    })}
                </div>

                {(channel === 'WHATSAPP' || channel === 'SMS') && (
                    <div className="mt-3 p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <p className="text-white text-xs font-bold mb-1.5">{n('extraNotifyPhoneLabel')}</p>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                            placeholder={user?.phone || n('extraNotifyPhonePh')} className={INPUT} />
                        <p className="text-gray-500 text-[11px] mt-1.5">{n('extraNotifyPhoneHint')}</p>
                    </div>
                )}

                {channel === 'EMAIL' && (
                    <div className="mt-3 p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <p className="text-white text-xs font-bold mb-1.5">{n('extraNotifyEmailLabel')}</p>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                            placeholder={user?.email || n('extraNotifyEmailPh')} className={INPUT} />
                        <p className="text-gray-500 text-[11px] mt-1.5">{n('extraNotifyEmailHint')}</p>
                    </div>
                )}

                {channel === 'TELEGRAM' && (
                    <div className="mt-3 p-3 rounded-xl bg-gray-900 border border-gray-800">
                        {telegramLinked ? (
                            <>
                                <p className="text-green-400 text-sm font-bold mb-2">✅ {n('extraNotifyTelegramLinked')}</p>
                                <button onClick={unlinkTelegram} disabled={linking}
                                    className="w-full py-2 rounded-lg border border-red-400 text-red-400 text-sm font-bold disabled:opacity-50">
                                    {n('extraNotifyTelegramUnlink')}
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-gray-500 text-[11px] mb-2">{n('extraNotifyTelegramHint')}</p>
                                <button onClick={linkTelegram} disabled={linking}
                                    className="w-full py-2.5 rounded-lg bg-[#229ED9] text-white text-sm font-black disabled:opacity-50">
                                    {linking ? '...' : `✈️ ${n('extraNotifyTelegramLink')}`}
                                </button>
                            </>
                        )}
                    </div>
                )}

                <button onClick={save} disabled={saving}
                    className="w-full mt-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 rounded-xl disabled:opacity-50">
                    {saving ? '...' : n('saveBtn')}
                </button>
            </div>
        </div>
    );
}

export default function NotificationSettingsModal({ open, onClose }) {
    const { t } = useTranslation();
    const n = (k) => t(`notif.${k}`);
    const dispatch = useDispatch();
    const user = useSelector(state => state.auth.user);
    const [friendOn, setFriendOn] = useState(user?.notifyFriendListings !== false);
    const [savingFriend, setSavingFriend] = useState(false);
    const [activityOn, setActivityOn] = useState(false);
    const [channelOpen, setChannelOpen] = useState(false);
    const [activityOpen, setActivityOpen] = useState(false);
    const [categories, setCategories] = useState([]);

    useEffect(() => {
        if (!open) return;
        api.get('/activity-alerts/me').then(({ data }) => setActivityOn(!!data.enabled)).catch(() => {});
        // Telegram bağlantısı / kanal bilgisi bot tarafında değişmiş olabilir — tazele
        api.get('/users/me').then(({ data }) => {
            dispatch(setUser({ ...user, ...data }));
            setFriendOn(data.notifyFriendListings !== false);
        }).catch(() => {});
        if (!categories.length) {
            api.get('/interests/categories').then(({ data }) => setCategories(data.categories || [])).catch(() => {});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const toggleFriend = async () => {
        const next = !friendOn;
        setFriendOn(next);
        setSavingFriend(true);
        try {
            const { data } = await api.patch('/users/me/notify-friend-listings', { enabled: next });
            dispatch(setUser({ ...user, notifyFriendListings: data.notifyFriendListings }));
        } catch (e) {
            setFriendOn(!next);
            alert(e?.response?.data?.message || n('actionFailed'));
        } finally { setSavingFriend(false); }
    };

    if (!open) return null;
    return (
        <>
            {!channelOpen && !activityOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
                    <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-white font-black text-lg">{n('notifSettingsTitle')}</h3>
                            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                        </div>

                        <button onClick={() => setChannelOpen(true)}
                            className="w-full flex items-center gap-3 py-3 border-b border-gray-800 text-left">
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-bold">{n('extraNotifyLabel')}</p>
                                <p className="text-gray-500 text-xs truncate">
                                    {user?.extraNotifyChannel ? n(`extraNotify_${user.extraNotifyChannel}`) : n('extraNotifyOff')}
                                </p>
                            </div>
                            <span className="text-gray-500 text-xl">›</span>
                        </button>

                        <div className="w-full flex items-center gap-3 py-3 border-b border-gray-800">
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-bold">{n('notifFriendListingsLabel')}</p>
                                <p className="text-gray-500 text-xs">{n('notifFriendListingsDesc')}</p>
                            </div>
                            <Toggle on={friendOn} busy={savingFriend} onClick={toggleFriend} />
                        </div>

                        <button onClick={() => setActivityOpen(true)}
                            className="w-full flex items-center gap-3 py-3 text-left">
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-bold">{n('actAlertTitle')}</p>
                                <p className="text-gray-500 text-xs">{activityOn ? n('notifActivityOnHint') : n('notifActivityOffHint')}</p>
                            </div>
                            <span className="text-gray-500 text-xl">›</span>
                        </button>
                    </div>
                </div>
            )}

            {channelOpen && (
                <ExtraChannelModal
                    user={user}
                    onClose={() => setChannelOpen(false)}
                    onSaved={(data) => dispatch(setUser({ ...user, ...data }))}
                />
            )}

            <ActivityAlertModal
                open={activityOpen}
                onClose={() => setActivityOpen(false)}
                categories={categories}
                onSaved={setActivityOn}
            />
        </>
    );
}
