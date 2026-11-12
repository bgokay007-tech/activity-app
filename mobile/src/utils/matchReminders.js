import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Yaklaşan Aktivitelerim bildirim ayarları. Varsayılan ofsetler maç olmasa da
// kaydedilir; sonra gelen / mevcut yaklaşan maçlara uygulanır. Cihaz yerel
// bildirimi — uygulama kapalıyken de OS tetikler.
const STORE_KEY = 'match_reminders_v1';
const DEFAULTS_KEY = 'match_reminder_defaults_v1';
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

function normalizeOffsets(offsetsMinutes) {
    return [...new Set((offsetsMinutes || []).map(Number).filter(n => n > 0))].sort((a, b) => a - b);
}

export async function getDefaultReminderOffsets() {
    try {
        const raw = await AsyncStorage.getItem(DEFAULTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return normalizeOffsets(Array.isArray(parsed) ? parsed : []);
    } catch {
        return [];
    }
}

/** Maç olmasa da kaydedilir — sonraki yaklaşan aktivitelere uygulanır. */
export async function setDefaultReminderOffsets(offsetsMinutes) {
    const wanted = normalizeOffsets(offsetsMinutes);
    await AsyncStorage.setItem(DEFAULTS_KEY, JSON.stringify(wanted));
    return wanted;
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
 * Tek maç için ofsetleri planlar. Geçmişe düşen ofsetler atlanır.
 */
export async function setMatchReminders(item, offsetsMinutes, strings = {}) {
    if (!item?.id) return { ok: false, reason: 'no_item', scheduled: 0 };
    const start = matchStartDate(item);
    if (!start) return { ok: false, reason: 'no_date', scheduled: 0 };

    const perm = await Notifications.requestPermissionsAsync().catch(() => ({ status: 'denied' }));
    if (perm?.status !== 'granted') return { ok: false, reason: 'denied', scheduled: 0 };

    await ensureChannel();
    const map = await readStore();
    const prev = map[item.id];
    if (prev?.ids) await cancelIds(Object.values(prev.ids));

    const wanted = normalizeOffsets(offsetsMinutes);
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

/**
 * Varsayılan ofsetleri kaydeder ve (varsa) yaklaşan maç listesine uygular.
 * Liste boş olsa bile varsayılanlar kalır.
 */
export async function saveReminderDefaultsAndApply(offsetsMinutes, matches = [], stringsFor = null) {
    const wanted = await setDefaultReminderOffsets(offsetsMinutes);

    if (!wanted.length) {
        // Tüm planlı hatırlatmaları temizle.
        const map = await readStore();
        for (const id of Object.keys(map)) {
            if (map[id]?.ids) await cancelIds(Object.values(map[id].ids));
        }
        await writeStore({});
        return { ok: true, scheduled: 0, defaults: [] };
    }

    const perm = await Notifications.requestPermissionsAsync().catch(() => ({ status: 'denied' }));
    if (perm?.status !== 'granted') return { ok: false, reason: 'denied', defaults: wanted, scheduled: 0 };

    let scheduled = 0;
    const list = Array.isArray(matches) ? matches : [];
    for (const item of list) {
        if (!item?.id || !matchStartDate(item)) continue;
        const strings = typeof stringsFor === 'function' ? stringsFor(item) : (stringsFor || {});
        const res = await setMatchReminders(item, wanted, strings);
        if (res?.ok) scheduled += res.scheduled || 0;
        if (res?.reason === 'denied') return { ok: false, reason: 'denied', defaults: wanted, scheduled };
    }
    return { ok: true, defaults: wanted, scheduled };
}
