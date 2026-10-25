import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenBackButton from '../../components/ScreenBackButton';
import MusicDetailModal from '../../components/MusicDetailModal';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';

const TABS = [
    { id: 'POST', key: 'sv_posts' },
    { id: 'REEL', key: 'sv_reels' },
    { id: 'MUSIC', key: 'sv_music' },
];

export default function SavedScreen({ navigation }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [tab, setTab] = useState('POST');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [musicDetail, setMusicDetail] = useState(null);

    const load = useCallback((kind) => {
        setLoading(true);
        api.get('/saved', { params: { kind } })
            .then(({ data }) => setItems(Array.isArray(data) ? data : []))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, []);

    useFocusEffect(useCallback(() => { load(tab); }, [load, tab]));

    const unsave = async (item) => {
        setItems(prev => prev.filter(x => x.id !== item.id));
        try {
            if (item.kind === 'MUSIC') await api.delete(`/saved/music/${item.id}`);
            else if (item.postId) await api.delete(`/saved/posts/${item.postId}`);
        } catch { load(tab); }
    };

    const empty = tab === 'REEL' ? t.sv_empty_reels : tab === 'MUSIC' ? t.sv_empty_music : t.sv_empty_posts;

    return (
        <View style={[s.page, { paddingTop: Math.max(insets.top, 12) }]}>
            <View style={s.head}>
                <ScreenBackButton onPress={() => navigation.goBack()}>
                    <Text style={s.back}>{t.back}</Text>
                </ScreenBackButton>
                <Text style={s.title}>{t.sv_title}</Text>
            </View>
            <View style={s.tabs}>
                {TABS.map(item => (
                    <TouchableOpacity key={item.id} onPress={() => setTab(item.id)} style={[s.tab, tab === item.id && s.tabOn]}>
                        <Text style={[s.tabText, tab === item.id && s.tabTextOn]}>{t[item.key]}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            {loading ? <ActivityIndicator color={colors.purple} style={{ marginTop: 28 }} /> : (
                <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
                    {items.length === 0 && <Text style={s.empty}>{empty}</Text>}
                    {items.map(item => {
                        if (item.kind === 'MUSIC') {
                            return (
                                <TouchableOpacity key={item.id} style={s.row} onPress={() => setMusicDetail(item)}>
                                    {item.musicCoverUrl ? <Image source={{ uri: item.musicCoverUrl }} style={s.thumb} /> : <View style={[s.thumb, s.fallback]}><Text>🎵</Text></View>}
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.name} numberOfLines={1}>{item.musicName}</Text>
                                        <Text style={s.sub} numberOfLines={1}>{item.musicArtist || t.sv_music}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => unsave(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                        <Text style={s.bookmark}>🔖</Text>
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            );
                        }
                        const post = item.post;
                        if (!post) return null;
                        return (
                            <View key={item.id} style={s.card}>
                                <View style={s.row}>
                                    <Text style={s.name} numberOfLines={1}>{post.user?.username || ''}</Text>
                                    <TouchableOpacity onPress={() => unsave(item)}>
                                        <Text style={s.bookmark}>🔖</Text>
                                    </TouchableOpacity>
                                </View>
                                {post.imageUrl ? (
                                    <Image source={{ uri: post.imageUrl }} style={s.media} />
                                ) : (
                                    <View style={[s.media, s.fallback]}><Text style={{ color: '#fff', fontSize: 28 }}>▶</Text></View>
                                )}
                                {!!post.content && <Text style={s.caption} numberOfLines={3}>{post.content}</Text>}
                            </View>
                        );
                    })}
                </ScrollView>
            )}
            <MusicDetailModal visible={!!musicDetail} track={musicDetail} onClose={() => { setMusicDetail(null); load(tab); }} />
        </View>
    );
}

const s = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
    back: { color: colors.purple, fontWeight: '800', fontSize: 15 },
    title: { color: '#fff', fontSize: 18, fontWeight: '900', flex: 1 },
    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
    tab: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center' },
    tabOn: { backgroundColor: colors.purple },
    tabText: { color: colors.textMuted, fontWeight: '800', fontSize: 13 },
    tabTextOn: { color: '#fff' },
    empty: { color: colors.textMuted, textAlign: 'center', marginTop: 36, fontSize: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    card: { marginBottom: 16, backgroundColor: colors.surface, borderRadius: 14, padding: 10 },
    thumb: { width: 52, height: 52, borderRadius: 8 },
    media: { width: '100%', height: 220, borderRadius: 12, marginTop: 8, backgroundColor: '#000' },
    fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
    name: { color: '#fff', fontWeight: '800', fontSize: 14, flex: 1 },
    sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    caption: { color: '#fff', fontSize: 13, marginTop: 8 },
    bookmark: { fontSize: 20 },
});
