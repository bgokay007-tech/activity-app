import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet, StatusBar, Platform, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import { playTrack } from '../../services/musicPlayer';

export default function MusicPlaylistDetailScreen({ route, navigation }) {
    const t = useT();
    const { playlist: initial } = route.params;
    const [playlist, setPlaylist] = useState(initial);

    const reload = useCallback(() => {
        api.get('/playlists').then(r => {
            const fresh = r.data.find(p => p.id === initial.id);
            if (fresh) setPlaylist(fresh);
        }).catch(() => {});
    }, [initial.id]);

    useFocusEffect(useCallback(() => { reload(); }, [reload]));

    const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];

    const handlePlay = (track) => {
        playTrack(track, tracks).catch(() => Alert.alert('', 'Çalma başlatılamadı'));
    };

    const handleRemove = (track) => {
        Alert.alert(t.musicRemoveTrackTitle || 'Şarkıyı Kaldır', track.title, [
            { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
            { text: t.resCancelBtn || 'Kaldır', style: 'destructive', onPress: async () => {
                try {
                    const { data } = await api.delete(`/playlists/${playlist.id}/tracks/${track.trackId}`);
                    setPlaylist(data);
                } catch { /* sessizce yut */ }
            }},
        ]);
    };

    const handleDeletePlaylist = () => {
        Alert.alert(t.musicDeletePlaylistTitle || 'Çalma Listesini Sil', playlist.name, [
            { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
            { text: t.resCancelBtn || 'Sil', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/playlists/${playlist.id}`);
                    navigation.goBack();
                } catch { /* sessizce yut */ }
            }},
        ]);
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.title} numberOfLines={1}>{playlist.name}</Text>
                    <Text style={s.subtitle}>{tracks.length} şarkı</Text>
                </View>
                <TouchableOpacity onPress={handleDeletePlaylist} style={s.deleteBtn}>
                    <Text style={{ color: '#f87171', fontSize: 12, fontWeight: '700' }}>🗑️</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={tracks}
                keyExtractor={item => item.trackId}
                contentContainerStyle={s.list}
                ListEmptyComponent={<Text style={s.emptyText}>{t.musicPlaylistEmpty || 'Bu liste boş.'}</Text>}
                renderItem={({ item }) => (
                    <View style={s.row}>
                        <TouchableOpacity style={s.rowMain} onPress={() => handlePlay(item)} activeOpacity={0.75}>
                            {item.imageUrl ? (
                                <Image source={{ uri: item.imageUrl }} style={s.rowArt} />
                            ) : (
                                <View style={[s.rowArt, s.rowArtFallback]}><Text style={{ fontSize: 16 }}>🎵</Text></View>
                            )}
                            <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
                                <Text style={s.rowArtist} numberOfLines={1}>{item.artist}</Text>
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleRemove(item)} style={s.rowIconBtn}>
                            <Text style={{ fontSize: 15, color: colors.textMuted }}>✕</Text>
                        </TouchableOpacity>
                    </View>
                )}
            />
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: colors.textSecondary, fontSize: 26, fontWeight: '300' },
    deleteBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { color: '#fff', fontSize: 16, fontWeight: '900' },
    subtitle: { color: colors.textMuted, fontSize: 11, marginTop: 1 },

    list: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 30 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 30 },

    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    rowArt: { width: 42, height: 42, borderRadius: 6 },
    rowArtFallback: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
    rowArtist: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
    rowIconBtn: { paddingHorizontal: 8, paddingVertical: 6 },
});
