import { useSyncExternalStore } from 'react';
import api from './api';

// Spotify (arama/meta veri) + YouTube (gizli video oynatıcı ile tam ses) hibrit
// modeli — react-native-track-player'ın aksine YouTube gerçek bir audio-stream URL'i
// vermediği için (ToS gereği), playback bir <YoutubePlayer> WebView bileşeni (bkz.
// YoutubeAudioPlayer.js) üzerinden yapılıyor. Bu dosya, o bileşenin ve ekranların
// (MiniPlayer, NowPlayingScreen) paylaştığı tek durumu (queue/index/oynatma) tutar.
// Eskiden react-native-track-player'ın sağladığı useActiveTrack/useIsPlaying/useProgress
// hook'larıyla aynı şekli döndürerek o ekranların değişmeden çalışmasını sağlıyoruz.

const state = {
    queue: [],
    index: -1,
    isPlaying: false,
    position: 0,
    duration: 0,
    seekRequest: null, // { pos, nonce } — YoutubeAudioPlayer bu değişince gerçek seek'i uygular
};
const listeners = new Set();

function notify() { listeners.forEach(fn => fn()); }
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function getSnapshot() { return state; }

function toPlayerTrack(t) {
    return {
        id: t.trackId,
        title: t.title,
        artist: t.artist,
        artwork: t.imageUrl || undefined,
        duration: t.duration || undefined,
        videoId: t.videoId || null,
        url: t.videoId ? `https://www.youtube.com/watch?v=${t.videoId}` : null,
    };
}

// Bir şarkının çalınabilmesi için YouTube video eşleşmesi gerekir — arama sonucunda
// henüz yoktur, ilk çalma anında (lazy) sunucudan çözülür ve bir daha aranmaz.
async function ensureVideoId(track) {
    if (track.videoId) return track;
    try {
        const { data } = await api.get('/music/resolve', { params: { title: track.title, artist: track.artist } });
        track.videoId = data.videoId;
        track.url = `https://www.youtube.com/watch?v=${data.videoId}`;
    } catch { /* çözülemedi — oynatıcı boş kalır, kullanıcı başka şarkı seçebilir */ }
    return track;
}

export async function playTrack(track, queue = []) {
    const rest = queue.filter(q => q.trackId !== track.trackId);
    state.queue = [track, ...rest].map(toPlayerTrack);
    state.index = 0;
    state.isPlaying = true;
    state.position = 0;
    state.duration = state.queue[0]?.duration || 0;
    notify();
    await ensureVideoId(state.queue[0]);
    notify();
}

export async function togglePlayPause(isPlaying) {
    state.isPlaying = !isPlaying;
    notify();
}

export async function skipNext() {
    if (state.index < 0 || state.index >= state.queue.length - 1) return;
    state.index += 1;
    state.position = 0;
    state.isPlaying = true;
    notify();
    await ensureVideoId(state.queue[state.index]);
    notify();
}

export async function skipPrevious() {
    if (state.index <= 0) return;
    state.index -= 1;
    state.position = 0;
    state.isPlaying = true;
    notify();
    await ensureVideoId(state.queue[state.index]);
    notify();
}

export function seekTo(pos) {
    state.position = pos;
    state.seekRequest = { pos, nonce: Date.now() };
    notify();
}

// react-native-track-player'daki aynı isimli hook'ların yerine geçer.
export function useActiveTrack() {
    const snap = useSyncExternalStore(subscribe, getSnapshot);
    return snap.index >= 0 ? snap.queue[snap.index] : null;
}
export function useIsPlaying() {
    const snap = useSyncExternalStore(subscribe, getSnapshot);
    return { playing: snap.isPlaying };
}
export function useProgress() {
    const snap = useSyncExternalStore(subscribe, getSnapshot);
    return { position: snap.position, duration: snap.duration };
}
export function useSeekRequest() {
    const snap = useSyncExternalStore(subscribe, getSnapshot);
    return snap.seekRequest;
}

// YoutubeAudioPlayer bileşeni tarafından kullanılır — WebView'dan gelen ilerleme/durum
// bilgisini paylaşılan duruma yazar.
export function _setProgress(position, duration) {
    state.position = position;
    if (duration) state.duration = duration;
    notify();
}
export function _onTrackEnded() {
    if (state.index < state.queue.length - 1) skipNext();
    else { state.isPlaying = false; notify(); }
}
