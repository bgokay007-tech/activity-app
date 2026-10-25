import { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import api from '../services/api';
import colors from '../theme/colors';
import useT from '../hooks/useT';

async function localPreview(url) {
    let hash = 0;
    const src = String(url);
    for (let i = 0; i < src.length; i++) hash = ((hash << 5) - hash + src.charCodeAt(i)) | 0;
    const dest = `${FileSystem.cacheDirectory}saved-music-${Math.abs(hash)}.mp3`;
    try {
        const info = await FileSystem.getInfoAsync(dest);
        if (info.exists && (info.size || 0) > 800) return dest;
    } catch { /* yeniden indir */ }
    const res = await FileSystem.downloadAsync(src.replace(/^http:\/\//i, 'https://'), dest);
    if (res.status && res.status >= 400) throw new Error('music');
    return res.uri;
}

export default function MusicDetailModal({ visible, track, onClose }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [playing, setPlaying] = useState(false);
    const [busy, setBusy] = useState(false);
    const [savedId, setSavedId] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!visible || !track?.musicUrl) { setSavedId(null); return undefined; }
        let alive = true;
        api.get('/saved', { params: { kind: 'MUSIC', musicKey: track.musicUrl } })
            .then(({ data }) => { if (alive) setSavedId(data?.[0]?.id || null); })
            .catch(() => {});
        return () => { alive = false; };
    }, [visible, track?.musicUrl]);

    useEffect(() => {
        let sound = null;
        let dead = false;
        if (!visible || !track?.musicUrl) return undefined;
        (async () => {
            setBusy(true);
            try {
                await Audio.setAudioModeAsync({
                    playsInSilentModeIOS: true,
                    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
                    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
                    shouldDuckAndroid: true,
                });
                let uri = track.musicUrl;
                try { uri = await localPreview(track.musicUrl); } catch { /* adresden dene */ }
                if (dead) return;
                const start = Math.max(0, Number(track.musicStartTime) || 0);
                const endRaw = Number(track.musicEndTime);
                const end = endRaw > start ? endRaw : start + 30;
                const { sound: next } = await Audio.Sound.createAsync(
                    { uri },
                    { shouldPlay: true, volume: 1, progressUpdateIntervalMillis: 250 },
                );
                if (dead) { next.unloadAsync().catch(() => {}); return; }
                sound = next;
                const startMs = Math.floor(start * 1000);
                const endMs = Math.floor(end * 1000);
                if (startMs > 0) { try { await next.setPositionAsync(startMs); } catch { /* baştan */ } }
                setPlaying(true);
                next.setOnPlaybackStatusUpdate((st) => {
                    if (!st.isLoaded) return;
                    setPlaying(!!st.isPlaying);
                    if (st.didJustFinish || (st.positionMillis || 0) >= endMs - 80) {
                        next.setPositionAsync(startMs).then(() => next.playAsync()).catch(() => {});
                    }
                });
            } catch { setPlaying(false); }
            finally { if (!dead) setBusy(false); }
        })();
        return () => {
            dead = true;
            setPlaying(false);
            sound?.unloadAsync().catch(() => {});
        };
    }, [visible, track?.musicUrl, track?.musicStartTime, track?.musicEndTime]);

    const toggleSave = async () => {
        if (!track?.musicUrl || !track?.musicName || saving) return;
        setSaving(true);
        try {
            if (savedId) {
                await api.delete(`/saved/music/${savedId}`);
                setSavedId(null);
            } else {
                const { data } = await api.post('/saved/music', {
                    musicUrl: track.musicUrl,
                    musicName: track.musicName,
                    musicArtist: track.musicArtist || '',
                    musicCoverUrl: track.musicCoverUrl || null,
                    musicStartTime: track.musicStartTime ?? null,
                    musicEndTime: track.musicEndTime ?? null,
                });
                setSavedId(data?.id || '1');
            }
        } catch { /* kayıt kalır */ }
        finally { setSaving(false); }
    };

    return (
        <Modal visible={!!visible && !!track} animationType="slide" transparent onRequestClose={onClose}>
            <View style={st.backdrop}>
                <View style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                    <View style={st.head}>
                        <Text style={st.title}>{t.sv_listen}</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={st.close}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={st.center}>
                        {track?.musicCoverUrl ? (
                            <Image source={{ uri: track.musicCoverUrl }} style={st.cover} />
                        ) : (
                            <View style={[st.cover, st.coverFallback]}><Text style={{ fontSize: 42 }}>🎵</Text></View>
                        )}
                        <Text style={st.name} numberOfLines={2}>{track?.musicName}</Text>
                        {!!track?.musicArtist && <Text style={st.artist} numberOfLines={1}>{track.musicArtist}</Text>}
                        {busy ? <ActivityIndicator color={colors.purple} style={{ marginTop: 16 }} /> : (
                            <Text style={st.play}>{playing ? '▶' : '♪'}</Text>
                        )}
                        <TouchableOpacity onPress={toggleSave} disabled={!track?.musicUrl || saving} style={[st.saveBtn, savedId && st.saveBtnOn]}>
                            <Text style={st.saveText}>{savedId ? t.sv_saved : t.sv_save}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const st = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 14 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: '#fff', fontSize: 16, fontWeight: '900' },
    close: { color: colors.textMuted, fontSize: 22 },
    center: { alignItems: 'center', paddingVertical: 18 },
    cover: { width: 160, height: 160, borderRadius: 16, marginBottom: 14 },
    coverFallback: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    name: { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center' },
    artist: { color: colors.textMuted, fontSize: 14, marginTop: 4, textAlign: 'center' },
    play: { color: '#a78bfa', fontSize: 28, marginTop: 12 },
    saveBtn: { marginTop: 18, backgroundColor: colors.purple, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
    saveBtnOn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.purple },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
