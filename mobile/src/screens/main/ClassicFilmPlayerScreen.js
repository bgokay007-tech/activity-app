import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform, ActivityIndicator, Alert } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';

export default function ClassicFilmPlayerScreen({ route, navigation }) {
    const t = useT();
    const { filmId, filmTitle } = route.params;
    const [videoUrl, setVideoUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [buffering, setBuffering] = useState(false);

    useEffect(() => {
        let cancelled = false;
        api.get(`/movies/classics/${filmId}/stream`)
            .then(({ data }) => { if (!cancelled) setVideoUrl(data.videoUrl); })
            .catch((e) => {
                Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.cinemaStreamError || 'Film oynatılamıyor.');
                navigation.goBack();
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [filmId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Kullanıcı raporu: "İzle'ye basınca siyah ekran, film gelmiyor" — useVideoPlayer'ın
    // setup callback'i SADECE player ilk oluşturulduğunda (source hâlâ null iken) bir kez
    // çalışıyor; URL sonradan gelse bile kaynak kendiliğinden yüklenmiyor. Medya sekmesinde
    // aynı hata replaceAsync ile düzeltilmişti (bkz. SubCategoryScreen MediaTile).
    const player = useVideoPlayer(null);
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
        const sub = player.addListener('statusChange', ({ status, error }) => {
            if (status === 'readyToPlay') setBuffering(false);
            if (status === 'error') {
                setBuffering(false);
                Alert.alert(t.error || 'Hata', error?.message || t.cinemaStreamError || 'Film oynatılamıyor.');
            }
        });
        return () => sub.remove();
    }, [player]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 20 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
                    <Text style={s.closeBtnText}>✕</Text>
                </TouchableOpacity>
                <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{filmTitle}</Text>
            </View>

            {loading || !videoUrl ? (
                <View style={s.center}>
                    <ActivityIndicator color={colors.purple} size="large" />
                </View>
            ) : (
                <View style={s.videoWrap}>
                    <VideoView player={player} style={s.video} contentFit="contain" allowsFullscreen allowsPictureInPicture nativeControls />
                    {buffering ? (
                        <View style={s.bufferOverlay} pointerEvents="none">
                            <ActivityIndicator color={colors.purple} size="large" />
                        </View>
                    ) : null}
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
    closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { color: '#fff', fontSize: 18 },
    title: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    videoWrap: { flex: 1, backgroundColor: '#000' },
    video: { flex: 1, backgroundColor: '#000' },
    bufferOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
