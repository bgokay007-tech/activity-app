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

    const player = useVideoPlayer(videoUrl || null, (p) => {
        if (videoUrl) p.play();
    });

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 20 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
                    <Text style={s.closeBtnText}>✕</Text>
                </TouchableOpacity>
                <Text style={s.title} numberOfLines={1}>{filmTitle}</Text>
            </View>

            {loading || !videoUrl ? (
                <View style={s.center}>
                    <ActivityIndicator color={colors.purple} size="large" />
                </View>
            ) : (
                <VideoView player={player} style={s.video} allowsFullscreen allowsPictureInPicture nativeControls />
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
    video: { flex: 1, backgroundColor: '#000' },
});
