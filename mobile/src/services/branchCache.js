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

export function rememberBranch(category, sub, view) {
    viewCache.set(keyOf(category, sub), view);
}

// Paylaşım hemen ardından gelen eski liste yanıtı yeni gönderiyi ezmesin diye
// bir sonraki yükleme ağı yeniden sorsun.
export function dropBranchListCache(category, sub) {
    rawCache.delete(keyOf(category, sub));
}

export function prefetchBranchLists(category, sub, { fresh = false } = {}) {
    const key = keyOf(category, sub);
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
