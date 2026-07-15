import TrackPlayer, { Capability, AppKilledPlaybackBehavior } from 'react-native-track-player';

let setupPromise = null;

// TrackPlayer.setupPlayer() birden fazla kez çağrılırsa hata fırlatır — tek seferlik
// kurulum promise'i paylaşılarak aynı anda birden fazla ekran çalma başlatsa da güvenli olur.
export function setupPlayerOnce() {
    if (!setupPromise) {
        setupPromise = TrackPlayer.setupPlayer().then(() =>
            TrackPlayer.updateOptions({
                capabilities: [
                    Capability.Play, Capability.Pause,
                    Capability.SkipToNext, Capability.SkipToPrevious, Capability.Stop,
                ],
                compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious],
                android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback },
            })
        );
    }
    return setupPromise;
}

// Bizim track meta şeklimizi ({trackId,title,artist,imageUrl,streamUrl,duration})
// TrackPlayer'ın beklediği Track şekline çevirir.
function toPlayerTrack(t) {
    return {
        id: t.trackId,
        url: t.streamUrl,
        title: t.title,
        artist: t.artist,
        artwork: t.imageUrl || undefined,
        duration: t.duration || undefined,
    };
}

// Verilen şarkıyı hemen çalar; queue verilirse (ör. bir çalma listesinin geri kalanı
// veya arama sonuçları) kuyruğun devamı olarak eklenir — sonraki/önceki bu kuyrukta gezer.
export async function playTrack(track, queue = []) {
    await setupPlayerOnce();
    const rest = queue.filter(q => q.trackId !== track.trackId);
    await TrackPlayer.reset();
    await TrackPlayer.add([track, ...rest].map(toPlayerTrack));
    await TrackPlayer.play();
}

export async function togglePlayPause(isPlaying) {
    await setupPlayerOnce();
    if (isPlaying) await TrackPlayer.pause();
    else await TrackPlayer.play();
}

export async function skipNext() {
    try { await TrackPlayer.skipToNext(); } catch { /* kuyrukta sonraki yok */ }
}

export async function skipPrevious() {
    try { await TrackPlayer.skipToPrevious(); } catch { /* kuyrukta önceki yok */ }
}
