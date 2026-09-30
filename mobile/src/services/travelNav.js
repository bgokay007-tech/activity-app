import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildNavModel, navProgress } from '../utils/travelOffline';

// Seyahat rotası navigasyonu — arka planda konumu izler, tek bir sabit bildirimi günceller.
// Akıllı saatler (Wear OS / Huawei / Galaxy) telefon bildirimlerini yansıttığı için
// kalan mesafe ve "rotadan çıktın" uyarısı bileğe de düşer. Görev headless çalışır;
// rota ve çevrilmiş metinler AsyncStorage üzerinden taşınır.
const TASK_NAME = 'TRAVEL_NAV_TASK';
const STATE_KEY = 'travel_nav_state';
const NOTIF_ID = 'travel-nav';
const CHANNEL = 'travel-nav';
const MIN_NOTIFY_MS = 15000;

let cachedModel = null;
let cachedRouteId = null;

const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

async function ensureChannel() {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Rota navigasyonu', importance: Notifications.AndroidImportance.DEFAULT,
        sound: null, enableVibrate: false,
    }).catch(() => {});
}

async function postNavNotification(state, prog, force = false) {
    const now = Date.now();
    const offRoute = prog.offRouteM > 80;
    // Rotadan çıkış anı beklemesin — hemen bildir.
    if (!force && !prog.arrived && offRoute === !!state.lastOff && now - (state.lastAt || 0) < MIN_NOTIFY_MS) return state;
    const s = state.strings || {};
    const km = (prog.remainingM / 1000).toFixed(prog.remainingM < 10000 ? 2 : 1);
    const body = prog.arrived
        ? s.arrived
        : offRoute
            ? fill(s.off, { m: Math.round(prog.offRouteM), km })
            : fill(s.body, { pct: prog.pct, km });
    await Notifications.scheduleNotificationAsync({
        identifier: NOTIF_ID,
        content: {
            title: `🧭 ${state.title || ''}`,
            body,
            sticky: !prog.arrived,
            autoDismiss: !!prog.arrived,
            data: { type: 'TRAVEL_NAV', routeId: state.routeId },
            ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
        },
        trigger: null,
    }).catch(() => {});
    return { ...state, lastAt: now, lastOff: offRoute, arrived: !!prog.arrived };
}

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    try {
        const raw = await AsyncStorage.getItem(STATE_KEY);
        if (!raw) return;
        const state = JSON.parse(raw);
        if (state.arrived) return;
        if (!cachedModel || cachedRouteId !== state.routeId) {
            cachedModel = buildNavModel(state.path);
            cachedRouteId = state.routeId;
        }
        const loc = data.locations[data.locations.length - 1];
        const prog = navProgress(cachedModel, { lat: loc.coords.latitude, lng: loc.coords.longitude });
        if (!prog) return;
        const next = await postNavNotification(state, prog);
        if (next !== state) await AsyncStorage.setItem(STATE_KEY, JSON.stringify(next));
        if (prog.arrived) await Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => {});
    } catch { /* bir sonraki konumda tekrar dener */ }
});

export async function startBackgroundNav({ routeId, title, path, strings }) {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) return { ok: false, reason: 'denied' };
    const bg = await Location.requestBackgroundPermissionsAsync();
    await Notifications.requestPermissionsAsync().catch(() => {});
    await ensureChannel();
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify({ routeId, title, path, strings, lastAt: 0 }));
    cachedModel = null;
    const already = await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false);
    if (already) await Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => {});
    await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.Fitness,
        foregroundService: {
            notificationTitle: strings.fgTitle || title,
            notificationBody: strings.fgBody || '',
        },
    });
    return { ok: true, background: bg.granted };
}

export async function stopBackgroundNav() {
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => {});
    await AsyncStorage.removeItem(STATE_KEY);
    await Notifications.dismissNotificationAsync(NOTIF_ID).catch(() => {});
    cachedModel = null;
}

export async function getActiveNavRouteId() {
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false);
    if (!started) return null;
    try { return JSON.parse((await AsyncStorage.getItem(STATE_KEY)) || 'null')?.routeId || null; } catch { return null; }
}
