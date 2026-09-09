import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform, ActivityIndicator, Alert } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { prefetchClassicStream } from '../../utils/classicFilmStream';

export default function ClassicFilmPlayerScreen({ route, navigation }) {
    const t = useT();
    const { filmId, filmTitle } = route.params;
    const [videoUrl, setVideoUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [buffering, setBuffering] = useState(false);
    // Kullanıcı raporu: "ekranı tam doldurma ayarı yok" — contain siyah bant bırakıyordu.
    const [fillScreen, setFillScreen] = useState(true);
    const videoViewRef = useRef(null);
    const hasFrameRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        prefetchClassicStream(filmId)
            .then((data) => { if (!cancelled) setVideoUrl(data.videoUrl); })
            .catch((e) => {
                Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.cinemaStreamError || 'Film oynatılamıyor.');
                navigation.goBack();
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [filmId]); // eslint-disable-line react-hooks/exhaustive-deps

    const player = useVideoPlayer(null, (p) => {
        // İlk kare için kısa min tampon; ileri sarmada 3 sn yetmeyip her atlayışta
        // ABD arşivine yeni Range isteği gidiyordu. 12 sn öndeki parça +10'u yerelde tutar.
        p.bufferOptions = {
            preferredForwardBufferDuration: 12,
            minBufferForPlayback: 0.8,
            prioritizeTimeOverSizeThreshold: true,
            waitsToMinimizeStalling: false,
        };
    });
    useEffect(() => {
        if (!videoUrl) {
            player.pause();
            return undefined;
        }
        let cancelled = false;
        setBuffering(true);
        player.replaceAsync({ uri: videoUrl, metadata: { title: filmTitle || '' } })
            .then(() => { if (!cancelled) player.play(); })
            .catch(() => {
                if (cancelled) return;
                Alert.alert(t.error || 'Hata', t.cinemaStreamError || 'Film oynatılamıyor.');
                navigation.goBack();
            });
        return () => { cancelled = true; player.pause(); };
    }, [videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const onStatus = player.addListener('statusChange', ({ status, error }) => {
            if (status === 'readyToPlay') setBuffering(false);
            if (status === 'loading' && hasFrameRef.current) setBuffering(true);
            if (status === 'error') {
                setBuffering(false);
                Alert.alert(t.error || 'Hata', error?.message || t.cinemaStreamError || 'Film oynatılamıyor.');
            }
        });
        const onPlaying = player.addListener('playingChange', ({ isPlaying }) => {
            if (isPlaying) setBuffering(false);
        });
        return () => {
            onStatus.remove();
            onPlaying.remove();
        };
    }, [player]); // eslint-disable-line react-hooks/exhaustive-deps

    const skipBy = (seconds) => {
        player.seekBy(seconds);
        player.play();
    };

    const enterFullscreen = () => {
        videoViewRef.current?.enterFullscreen?.();
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" hidden={false} />
            {loading || !videoUrl ? (
                <View style={s.center}>
                    <ActivityIndicator color={colors.purple} size="large" />
                    <Text style={s.hint}>{t.cinemaStreamBuffering || 'Arşivden yükleniyor…'}</Text>
                </View>
            ) : (
                <View style={s.videoWrap}>
                    <VideoView
                        ref={videoViewRef}
                        player={player}
                        style={s.video}
                        contentFit={fillScreen ? 'cover' : 'contain'}
                        nativeControls
                        allowsPictureInPicture
                        fullscreenOptions={{ enable: true, orientation: 'landscape' }}
                        onFirstFrameRender={() => {
                            hasFrameRef.current = true;
                            setBuffering(false);
                        }}
                    />
                    {buffering ? (
                        <View style={s.bufferOverlay} pointerEvents="none">
                            <ActivityIndicator color={colors.purple} size="large" />
                            <Text style={s.hint}>{t.cinemaStreamBuffering || 'Arşivden yükleniyor…'}</Text>
                        </View>
                    ) : null}
                    <View style={s.skipRow} pointerEvents="box-none">
                        <TouchableOpacity onPress={() => skipBy(-10)} style={s.skipBtn}>
                            <Text style={s.skipBtnText}>−10</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => skipBy(10)} style={s.skipBtn}>
                            <Text style={s.skipBtnText}>+10</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => skipBy(30)} style={s.skipBtn}>
                            <Text style={s.skipBtnText}>+30</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 20 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
                    <Text style={s.closeBtnText}>✕</Text>
                </TouchableOpacity>
                <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{filmTitle}</Text>
                <TouchableOpacity onPress={() => setFillScreen((v) => !v)} style={s.hdrBtn}>
                    <Text style={s.hdrBtnText}>{fillScreen ? (t.cinemaFitScreen || 'Sığdır') : (t.cinemaFillScreen || 'Doldur')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={enterFullscreen} style={s.hdrBtn}>
                    <Text style={s.hdrBtnText}>{t.cinemaEnterFullscreen || 'Tam ekran'}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingBottom: 10,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { color: '#fff', fontSize: 18 },
    title: { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 },
    hdrBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)' },
    hdrBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
    hint: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 8 },
    videoWrap: { flex: 1, backgroundColor: '#000' },
    video: { flex: 1, backgroundColor: '#000' },
    bufferOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    skipRow: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 88,
        zIndex: 3,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
    },
    skipBtn: {
        minWidth: 56,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
    },
    skipBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
