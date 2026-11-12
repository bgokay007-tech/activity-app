import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Kullanıcı "Yaklaşan Aktivitelerim" içinden maça özel hatırlatma seçer
// (1 saat / 3 saat kala vb.). Sunucu cron'u değil — cihaz yerel bildirimi;
// uygulama kapalıyken de OS tetikler. AsyncStorage tercih + bildirim id'lerini tutar.
const STORE_KEY = 'match_reminders_v1';
const CHANNEL = 'match-reminders';

export const MATCH_REMINDER_OFFSETS = [
    { minutes: 15, key: '15m' },
    { minutes: 30, key: '30m' },
    { minutes: 60, key: '1h' },
    { minutes: 180, key: '3h' },
    { minutes: 360, key: '6h' },
    { minutes: 720, key: '12h' },
    { minutes: 1440, key: '1d' },
];

function matchStartDate(item) {
    if (!item?.matchDate || !item?.matchTime) return null;
    const [h, min] = String(item.matchTime).split(':').map(Number);
    const d = new Date(item.matchDate);
    if (isNaN(d.getTime()) || Number.isNaN(h)) return null;
    d.setHours(h, min || 0, 0, 0);
    return d;
}

async function ensureChannel() {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Maç hatırlatmaları',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        enableVibrate: true,
    }).catch(() => {});
}

async function readStore() {
    try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

async function writeStore(map) {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(map || {}));
}

async function cancelIds(ids = []) {
    await Promise.all(
        (ids || []).filter(Boolean).map(id =>
            Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
        )
    );
}

export async function getMatchReminderOffsets(rivalId) {
    if (!rivalId) return [];
    const map = await readStore();
    const row = map[rivalId];
    return Array.isArray(row?.offsets) ? row.offsets.map(Number).filter(n => n > 0) : [];
}

export async function getAllMatchReminderMap() {
    const map = await readStore();
    const out = {};
    Object.keys(map || {}).forEach(id => {
        const offsets = Array.isArray(map[id]?.offsets) ? map[id].offsets : [];
        if (offsets.length) out[id] = offsets.map(Number);
    });
    return out;
}

export async function clearMatchReminders(rivalId) {
    if (!rivalId) return;
    const map = await readStore();
    const row = map[rivalId];
    if (row?.ids) await cancelIds(Object.values(row.ids));
    delete map[rivalId];
    await writeStore(map);
}

/**
 * Seçilen "X dakika kala" ofsetlerini kaydeder ve yerel bildirimleri planlar.
 * Geçmişe düşen ofsetler atlanır. Tarih/saat yoksa { ok:false, reason:'no_date' }.
 */
export async function setMatchReminders(item, offsetsMinutes, strings = {}) {
    if (!item?.id) return { ok: false, reason: 'no_item' };
    const start = matchStartDate(item);
    if (!start) return { ok: false, reason: 'no_date' };

    const perm = await Notifications.requestPermissionsAsync().catch(() => ({ status: 'denied' }));
    if (perm?.status !== 'granted') return { ok: false, reason: 'denied' };

    await ensureChannel();
    const map = await readStore();
    const prev = map[item.id];
    if (prev?.ids) await cancelIds(Object.values(prev.ids));

    const wanted = [...new Set((offsetsMinutes || []).map(Number).filter(n => n > 0))].sort((a, b) => a - b);
    if (!wanted.length) {
        delete map[item.id];
        await writeStore(map);
        return { ok: true, scheduled: 0 };
    }

    const now = Date.now();
    const ids = {};
    let scheduled = 0;
    const sportLabel = strings.sportLabel || item.subCategory || '';
    const title = strings.title || '⏰ Match reminder';
    const bodyTpl = strings.bodyTpl || 'Your activity starts in {when}.';

    for (const minutes of wanted) {
        const when = new Date(start.getTime() - minutes * 60 * 1000);
        if (when.getTime() <= now + 5000) continue;
        const whenLabel = strings.labelFor?.(minutes) || `${minutes}m`;
        const body = String(bodyTpl)
            .replace('{when}', whenLabel)
            .replace('{sport}', sportLabel);
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: sportLabel ? `${title} · ${sportLabel}` : title,
                body,
                sound: 'default',
                data: {
                    type: 'MATCH_REMINDER',
                    rivalId: item.id,
                    category: item.category || 'SPORTS',
                    subCategory: item.subCategory || null,
                },
                ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: when,
                ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
            },
        }).catch(() => null);
        if (id) {
            ids[String(minutes)] = id;
            scheduled += 1;
        }
    }

    map[item.id] = {
        offsets: wanted,
        matchAt: start.toISOString(),
        ids,
        category: item.category || 'SPORTS',
        subCategory: item.subCategory || null,
    };
    await writeStore(map);
    return { ok: true, scheduled, skipped: wanted.length - scheduled };
}
