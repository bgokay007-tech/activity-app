import { useCallback, useState } from 'react';
import {
    View, Text, TouchableOpacity, Image, ActivityIndicator, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenBackButton from '../../components/ScreenBackButton';
import MusicDetailModal from '../../components/MusicDetailModal';
import { savedListName } from '../../components/SavePostToListModal';
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
    const [lists, setLists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [musicDetail, setMusicDetail] = useState(null);
    const [openList, setOpenList] = useState(null); // { id, kind, name } | null
    const [listItems, setListItems] = useState([]);
    const [listLoading, setListLoading] = useState(false);

    const loadHome = useCallback(() => {
        setLoading(true);
        Promise.all([
            api.get('/saved/lists').then(({ data }) => Array.isArray(data) ? data : []).catch(() => []),
            api.get('/saved', { params: { kind: tab } }).then(({ data }) => Array.isArray(data) ? data : []).catch(() => []),
        ]).then(([ls, its]) => {
            setLists(ls);
            setItems(its);
        }).finally(() => setLoading(false));
    }, [tab]);

    const loadList = useCallback((list) => {
        if (!list?.id) return;
        setListLoading(true);
        api.get(`/saved/lists/${list.id}`)
            .then(({ data }) => {
                setOpenList(data);
                setListItems(Array.isArray(data?.items) ? data.items : []);
            })
            .catch(() => {
                setOpenList(list);
                setListItems([]);
            })
            .finally(() => setListLoading(false));
    }, []);

    useFocusEffect(useCallback(() => {
        if (openList) loadList(openList);
        else loadHome();
    }, [loadHome, loadList, openList?.id]));

    const unsave = async (item) => {
        const postId = item.postId || item.post?.id;
        if (openList?.id && postId) {
            setListItems(prev => prev.filter(x => x.id !== item.id));
            try {
                await api.delete(`/saved/lists/${openList.id}/items/${postId}`);
            } catch { loadList(openList); }
            return;
        }
        setItems(prev => prev.filter(x => x.id !== item.id));
        try {
            if (item.kind === 'MUSIC') await api.delete(`/saved/music/${item.id}`);
            else if (postId) await api.delete(`/saved/posts/${postId}`);
        } catch { loadHome(); }
    };

    const deleteCustomList = (list) => {
        Alert.alert(
            t.sv_delete_list || 'Delete list',
            t.sv_delete_list_q || '',
            [
                { text: t.cancel || 'Cancel', style: 'cancel' },
                {
                    text: t.sv_delete_list || 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await api.delete(`/saved/lists/${list.id}`);
                            if (openList?.id === list.id) {
                                setOpenList(null);
                                setListItems([]);
                            }
                            loadHome();
                        } catch (e) {
                            Alert.alert(t.error || 'Error', e?.response?.data?.message || t.actionFailed || 'Failed');
                        }
                    },
                },
            ],
        );
    };

    const customs = lists.filter(l => l.kind === 'CUSTOM');
    const general = lists.find(l => l.kind === 'GENERAL');
    const showCategories = customs.length > 0;
    const empty = tab === 'REEL' ? t.sv_empty_reels : tab === 'MUSIC' ? t.sv_empty_music : t.sv_empty_posts;

    const renderPostCard = (item) => {
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
    };

    if (openList) {
        return (
            <View style={[s.page, { paddingTop: Math.max(insets.top, 12) }]}>
                <View style={s.head}>
                    <ScreenBackButton onPress={() => { setOpenList(null); setListItems([]); loadHome(); }}>
                        <Text style={s.back}>{t.back}</Text>
                    </ScreenBackButton>
                    <Text style={s.title} numberOfLines={1}>{savedListName(openList, t)}</Text>
                    {openList.kind === 'CUSTOM' && (
                        <TouchableOpacity onPress={() => deleteCustomList(openList)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ color: '#f87171', fontWeight: '800', fontSize: 13 }}>{t.sv_delete_list}</Text>
                        </TouchableOpacity>
                    )}
                </View>
                {listLoading ? <ActivityIndicator color={colors.purple} style={{ marginTop: 28 }} /> : (
                    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
                        {listItems.length === 0 && <Text style={s.empty}>{t.sv_empty_list}</Text>}
                        {listItems.map(renderPostCard)}
                    </ScrollView>
                )}
            </View>
        );
    }

    return (
        <View style={[s.page, { paddingTop: Math.max(insets.top, 12) }]}>
            <View style={s.head}>
                <ScreenBackButton onPress={() => navigation.goBack()}>
                    <Text style={s.back}>{t.back}</Text>
                </ScreenBackButton>
                <Text style={s.title}>{t.sv_title}</Text>
            </View>

            {showCategories && (
                <View style={{ paddingHorizontal: 12, marginBottom: 10 }}>
                    <Text style={s.section}>{t.sv_categories}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {general && (
                            <TouchableOpacity style={s.chip} onPress={() => loadList(general)}>
                                <Text style={s.chipEmoji}>📥</Text>
                                <Text style={s.chipText}>{savedListName(general, t)}</Text>
                                <Text style={s.chipCount}>{general.itemCount || 0}</Text>
                            </TouchableOpacity>
                        )}
                        {customs.map(l => (
                            <TouchableOpacity
                                key={l.id}
                                style={s.chip}
                                onPress={() => loadList(l)}
                                onLongPress={() => deleteCustomList(l)}
                            >
                                <Text style={s.chipEmoji}>📁</Text>
                                <Text style={s.chipText} numberOfLines={1}>{savedListName(l, t)}</Text>
                                <Text style={s.chipCount}>{l.itemCount || 0}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

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
                        return renderPostCard(item);
                    })}
                </ScrollView>
            )}
            <MusicDetailModal visible={!!musicDetail} track={musicDetail} onClose={() => { setMusicDetail(null); loadHome(); }} />
        </View>
    );
}

const s = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
    back: { color: colors.purple, fontWeight: '800', fontSize: 15 },
    title: { color: '#fff', fontSize: 18, fontWeight: '900', flex: 1 },
    section: { color: colors.textMuted, fontWeight: '800', fontSize: 12, marginBottom: 8, textTransform: 'uppercase' },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
        borderWidth: 1, borderColor: colors.border, maxWidth: 180,
    },
    chipEmoji: { fontSize: 16 },
    chipText: { color: '#fff', fontWeight: '800', fontSize: 13, flexShrink: 1 },
    chipCount: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
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
