import TrackPlayer, { Event } from 'react-native-track-player';

// Uzaktan kontroller (bildirim/kilit ekranı) buradan yönetilir — uygulama arka
// planda/kapalıyken bile bu servis çalışır.
module.exports = async function musicPlaybackService() {
    TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
    TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
    TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
    TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext().catch(() => {}));
    TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious().catch(() => {}));
    TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => TrackPlayer.seekTo(position));
    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => TrackPlayer.pause());
};
