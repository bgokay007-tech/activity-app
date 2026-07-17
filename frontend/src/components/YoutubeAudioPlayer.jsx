import { useEffect, useRef } from 'react';
import {
    useActiveTrack, useIsPlaying, useSeekRequest,
    _setProgress, _onTrackEnded,
} from '../services/musicPlayer';

let apiPromise = null;
function loadYoutubeApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve) => {
        const prevCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            prevCallback?.();
            resolve(window.YT);
        };
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
    });
    return apiPromise;
}

// Gizli (0x0) bir YouTube IFrame Player üzerinden sadece ses çalar — YouTube gerçek
// bir audio-stream URL'i vermediği için bu, ToS'a uygun tek yöntem.
export default function YoutubeAudioPlayer() {
    const track = useActiveTrack();
    const isPlaying = useIsPlaying();
    const seekRequest = useSeekRequest();
    const containerRef = useRef(null);
    const playerRef = useRef(null);
    const readyRef = useRef(false);
    const pollRef = useRef(null);
    const lastSeekNonce = useRef(null);

    useEffect(() => {
        let cancelled = false;
        loadYoutubeApi().then((YT) => {
            if (cancelled || !containerRef.current) return;
            playerRef.current = new YT.Player(containerRef.current, {
                height: '0', width: '0',
                playerVars: { autoplay: 0, controls: 0, disablekb: 1 },
                events: {
                    onReady: () => { readyRef.current = true; },
                    onStateChange: (e) => {
                        if (e.data === YT.PlayerState.ENDED) _onTrackEnded();
                    },
                },
            });
        });
        pollRef.current = setInterval(() => {
            const p = playerRef.current;
            if (!readyRef.current || !p?.getCurrentTime) return;
            try {
                _setProgress(p.getCurrentTime() || 0, p.getDuration() || 0);
            } catch { /* player not ready yet */ }
        }, 1000);
        return () => {
            cancelled = true;
            clearInterval(pollRef.current);
            playerRef.current?.destroy?.();
        };
    }, []);

    // Track değişince yeni videoyu yükle
    useEffect(() => {
        const p = playerRef.current;
        if (!readyRef.current || !p?.loadVideoById) return;
        if (track?.videoId) {
            p.loadVideoById(track.videoId);
            if (!isPlaying) p.pauseVideo?.();
        } else {
            p.stopVideo?.();
        }
    }, [track?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Play/pause senkronu
    useEffect(() => {
        const p = playerRef.current;
        if (!readyRef.current || !track?.videoId) return;
        if (isPlaying) p.playVideo?.();
        else p.pauseVideo?.();
    }, [isPlaying, track?.videoId]);

    // Seek istekleri
    useEffect(() => {
        const p = playerRef.current;
        if (!readyRef.current || !seekRequest || seekRequest.nonce === lastSeekNonce.current) return;
        lastSeekNonce.current = seekRequest.nonce;
        p?.seekTo?.(seekRequest.pos, true);
    }, [seekRequest]);

    return <div style={{ position: 'fixed', width: 0, height: 0, overflow: 'hidden' }}><div ref={containerRef} /></div>;
}
