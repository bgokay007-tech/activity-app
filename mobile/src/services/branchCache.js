import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

// Dal ekranı 7 isteği bitene kadar tam ekran dönüyordu. Karoya dokunulduğu anda
// aynı istekler başlar; ekran açılınca bitmiş yanıt varsa anında boyanır.
const rawCache = new Map();
const inflight = new Map();
const viewCache = new Map();

const keyOf = (category, sub) => `${category}:${sub}`;

export function recallBranch(category, sub) {
    return viewCache.get(keyOf(category, sub)) || null;
}

const diskKey = (category, sub) => `branch_view_${category}_${sub}`;

export function rememberBranch(category, sub, view) {
    viewCache.set(keyOf(category, sub), view);
    AsyncStorage.setItem(diskKey(category, sub), JSON.stringify(view)).catch(() => {});
}

export function hydrateBranch(category, sub) {
    const hit = viewCache.get(keyOf(category, sub));
    if (hit) return Promise.resolve(hit);
    return AsyncStorage.getItem(diskKey(category, sub)).then((raw) => {
        if (!raw) return null;
        const view = JSON.parse(raw);
        viewCache.set(keyOf(category, sub), view);
        return view;
    }).catch(() => null);
}

// Paylaşım hemen ardından gelen eski liste yanıtı yeni gönderiyi ezmesin diye
// bir sonraki yükleme ağı yeniden sorsun.
export function dropBranchListCache(category, sub) {
    rawCache.delete(keyOf(category, sub));
}

// "4 ilan" yazısı her girişte ağ bitene kadar kayboluyordu. Son bilinen sayılar
// anında çizilir, taze cevap gelince güncellenir. Diskteki kopya soğuk açılışta da durur.
const COUNTS_KEY = 'activity_rival_counts_v1';
const countCache = new Map();
let countsHydrated = null;

export function hydrateCounts() {
    if (!countsHydrated) {
        countsHydrated = AsyncStorage.getItem(COUNTS_KEY).then((raw) => {
            if (!raw) return;
            const all = JSON.parse(raw);
            Object.entries(all || {}).forEach(([k, v]) => { if (v && typeof v === 'object') countCache.set(k, v); });
        }).catch(() => {});
    }
    return countsHydrated;
}

export function recallCounts(category) {
    return countCache.get(String(category || '').toUpperCase()) || null;
}

export function rememberCounts(category, counts) {
    if (!counts || typeof counts !== 'object') return;
    const key = String(category || '').toUpperCase();
    countCache.set(key, counts);
    AsyncStorage.getItem(COUNTS_KEY).then((raw) => {
        const all = raw ? JSON.parse(raw) : {};
        all[key] = counts;
        return AsyncStorage.setItem(COUNTS_KEY, JSON.stringify(all));
    }).catch(() => {});
}

export function prefetchCounts(category) {
    const key = String(category || '').toUpperCase();
    return api.get(`/rivals/counts?category=${key}`).then((r) => {
        rememberCounts(key, r.data || {});
        return r.data || {};
    }).catch(() => recallCounts(key) || {});
}

hydrateCounts();

// Açık ilanı olan dalların listesi, karoya basılmadan hazır olsun.
export function prefetchHotBranches(category, counts) {
    const key = String(category || '').toUpperCase();
    const map = counts || recallCounts(key) || {};
    Object.entries(map)
        .filter(([, n]) => Number(n) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 3)
        .forEach(([sub]) => { prefetchBranchLists(key, sub).catch(() => {}); });
}

export function prefetchBranchLists(category, sub, { fresh = false } = {}) {
    const key = keyOf(category, sub);
    // fresh: yorum/beğeni sonrası bayat paket dönmesin (ana sayfaya gidip gelince
    // medya yorum sayacı 0 kalıyordu — rawCache silinmeden eski _count geliyordu).
    if (fresh) {
        rawCache.delete(key);
        inflight.delete(key);
    }
    if (!fresh && rawCache.has(key)) return Promise.resolve(rawCache.get(key));
    if (!fresh && inflight.has(key)) return inflight.get(key);
    const task = Promise.all([
        api.get(`/rivals?category=${category}&subCategory=${sub}`),
        api.get(`/rivals?category=${category}&subCategory=${sub}&matchType=PLAYER_WANTED`).catch(() => ({ data: [] })),
        api.get(`/posts?category=${category}&subCategory=${sub}&communityOnly=true&limit=30`).catch(() => ({ data: [] })),
        api.get(`/posts?category=${category}&subCategory=${sub}&mediaOnly=true&limit=50`).catch(() => ({ data: [] })),
        api.get(`/posts?category=${category}&subCategory=${sub}&type=STORY&limit=100`).catch(() => ({ data: [] })),
        api.get(`/rivals/upcoming?category=${category}&subCategory=${sub}`).catch(() => ({ data: [] })),
        api.get(`/rivals/completed?category=${category}&subCategory=${sub}`).catch(() => ({ data: [] })),
    ]).then((pack) => {
        rawCache.set(key, pack);
        inflight.delete(key);
        return pack;
    }).catch((err) => {
        inflight.delete(key);
        throw err;
    });
    inflight.set(key, task);
    return task;
}
