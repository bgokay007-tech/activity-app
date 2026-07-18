import { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, StatusBar, Platform, Alert } from 'react-native';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import { useActiveTrack, useIsPlaying, useProgress, togglePlayPause, skipNext, skipPrevious, seekTo } from '../../services/musicPlayer';

function fmt(sec) {
    if (!sec || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

export default function NowPlayingScreen({ navigation }) {
    const t = useT();
    const track = useActiveTrack();
    const { playing } = useIsPlaying();
    const progress = useProgress();
    const [barWidth, setBarWidth] = useState(0);
    const [liked, setLiked] = useState(false);

    useEffect(() => {
        if (!track?.id) return;
        api.get('/music/liked').then(r => {
            setLiked((r.data || []).some(l => l.trackId === track.id));
        }).catch(() => {});
    }, [track?.id]);

    if (!track) {
        return (
            <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.textMuted }}>{t.musicNothingPlaying || 'Şu an çalan bir şarkı yok.'}</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
                    <Text style={{ color: colors.purple, fontWeight: '700' }}>{t.back || 'Geri'}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const pct = progress.duration > 0 ? progress.position / progress.duration : 0;

    const handleSeek = (e) => {
        if (!barWidth || !progress.duration) return;
        const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth));
        seekTo(ratio * progress.duration);
    };

    const handleLike = async () => {
        try {
            if (liked) {
                await api.delete(`/music/liked/${track.id}`);
            } else {
                await api.post('/music/liked', {
                    trackId: track.id, title: track.title, artist: track.artist,
                    imageUrl: track.artwork, streamUrl: track.url, duration: track.duration,
                });
            }
            setLiked(l => !l);
        } catch { /* sessizce yut */ }
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 20 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
                    <Text style={s.closeBtnText}>▾</Text>
                </TouchableOpacity>
            </View>

            <View style={s.artWrap}>
                {track.artwork ? (
                    <Image source={{ uri: track.artwork }} style={s.art} />
                ) : (
                    <View style={[s.art, s.artFallback]}><Text style={{ fontSize: 64 }}>🎵</Text></View>
                )}
            </View>

            <View style={s.infoBlock}>
                <Text style={s.songTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{track.title}</Text>
                <Text style={s.songArtist} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{track.artist}</Text>
            </View>

            <TouchableOpacity
                style={s.progressWrap}
                activeOpacity={1}
                onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
                onPress={handleSeek}
            >
                <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${pct * 100}%` }]} />
                </View>
            </TouchableOpacity>
            <View style={s.timeRow}>
                <Text style={s.timeText}>{fmt(progress.position)}</Text>
                <Text style={s.timeText}>{fmt(progress.duration)}</Text>
            </View>

            <View style={s.controlsRow}>
                <TouchableOpacity onPress={handleLike} style={s.sideBtn}>
                    <Text style={{ fontSize: 22 }}>{liked ? '❤️' : '🤍'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={skipPrevious} style={s.ctrlBtn}>
                    <Text style={s.ctrlIcon}>⏮</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => togglePlayPause(!!playing)} style={s.playBtn}>
                    <Text style={s.playIcon}>{playing ? '⏸' : '▶️'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={skipNext} style={s.ctrlBtn}>
                    <Text style={s.ctrlIcon}>⏭</Text>
                </TouchableOpacity>
                <View style={s.sideBtn} />
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg, padding: 20 },
    header: { flexDirection: 'row', justifyContent: 'flex-end' },
    closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { color: colors.textSecondary, fontSize: 28 },

    artWrap: { alignItems: 'center', marginTop: 20 },
    art: { width: 260, height: 260, borderRadius: 16 },
    artFallback: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },

    infoBlock: { marginTop: 28, alignItems: 'center' },
    songTitle: { color: '#fff', fontSize: 19, fontWeight: '900', maxWidth: '90%' },
    songArtist: { color: colors.textMuted, fontSize: 14, marginTop: 4 },

    progressWrap: { marginTop: 28, paddingVertical: 8 },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.surface2, overflow: 'hidden' },
    progressFill: { height: 4, backgroundColor: colors.purple },
    timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    timeText: { color: colors.textMuted, fontSize: 11 },

    controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 36 },
    sideBtn: { width: 44, alignItems: 'center' },
    ctrlBtn: { paddingHorizontal: 14 },
    ctrlIcon: { fontSize: 30, color: '#fff' },
    playBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
    playIcon: { fontSize: 28, color: '#fff' },
});
