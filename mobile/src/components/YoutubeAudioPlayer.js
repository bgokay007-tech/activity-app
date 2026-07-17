import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { useActiveTrack, useIsPlaying, useSeekRequest, _setProgress, _onTrackEnded } from '../services/musicPlayer';

// Kök seviyede (navigation/index.js içinde MiniPlayer ile birlikte) tek sefer render
// edilir — hangi ekranda olursak olalım şarkı çalmaya devam etsin diye. Görsel olarak
// gizli (1x1, opacity 0) tutulur; ses YouTube'un resmi IFrame Player'ından gelir.
export default function YoutubeAudioPlayer() {
    const track = useActiveTrack();
    const { playing } = useIsPlaying();
    const seekRequest = useSeekRequest();
    const ref = useRef(null);

    useEffect(() => {
        if (seekRequest) ref.current?.seekTo?.(seekRequest.pos, true);
    }, [seekRequest?.nonce]);

    useEffect(() => {
        if (!playing || !track?.videoId) return;
        const iv = setInterval(async () => {
            try {
                const [pos, dur] = await Promise.all([
                    ref.current?.getCurrentTime?.(),
                    ref.current?.getDuration?.(),
                ]);
                if (typeof pos === 'number') _setProgress(pos, dur || 0);
            } catch { /* henüz hazır değil */ }
        }, 500);
        return () => clearInterval(iv);
    }, [playing, track?.videoId]);

    if (!track?.videoId) return null;

    return (
        <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} pointerEvents="none">
            <YoutubePlayer
                ref={ref}
                height={1}
                width={1}
                videoId={track.videoId}
                play={playing}
                onChangeState={(s) => { if (s === 'ended') _onTrackEnded(); }}
                webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
                initialPlayerParams={{ controls: false, modestbranding: true }}
            />
        </View>
    );
}
