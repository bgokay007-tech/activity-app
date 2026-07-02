import { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, TouchableWithoutFeedback,
    StyleSheet, ActivityIndicator, Image, Platform, Dimensions,
} from 'react-native';
// expo-av SDK 54 Expo Go'da çalışmıyor — null stub ile güvenli kullanım
const Audio = null;
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';
import colors from '../../theme/colors';

const SCREEN_W = Dimensions.get('window').width;

const SUB_EMOJI = {
    football:'⚽', basketball:'🏀', tennis:'🎾', padel:'🏓', volleyball:'🏐',
    swimming:'🏊', running:'🏃', cycling:'🚴', boxing:'🥊', martial_arts:'🥋', wellness:'🧘',
    music:'🎵', painting:'🎨', dance:'💃', photography:'📸', theater:'🎭',
    writing:'✍️', sculpture:'🗿', cinema:'🎬', poetry:'📜', illustration:'🖼️',
    fps:'🎯', rpg:'⚔️', strategy:'♟️', sports_games:'🎮', moba:'🏆',
    battle_royale:'💥', simulation:'🌍', puzzle:'🧩', racing:'🏎️', card_games:'🃏',
};

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'az önce';
    if (m < 60) return `${m} dk önce`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} sa önce`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} gün önce`;
    return new Date(dateStr).toLocaleDateString('tr-TR');
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ post, liked, onToggleLike, isVisible, dataSaver, isMusicPlaying, onMusicTap }) {
    const lastTap = useRef(0);
    const [heartFlash, setHeartFlash] = useState(false);
    const [videoPaused, setVideoPaused] = useState(false);
    const [videoUnlocked, setVideoUnlocked] = useState(false); // user tapped "play" in data saver mode

    // Reset per-post state when post scrolls away
    useEffect(() => {
        if (!isVisible) {
            setVideoPaused(false);
            setVideoUnlocked(false);
        }
    }, [isVisible]);

    const shouldPlayVideo = isVisible && !videoPaused && (dataSaver ? videoUnlocked : true);

    const handleTap = () => {
        const now = Date.now();
        const isDouble = now - lastTap.current < 280;
        lastTap.current = now;

        if (isDouble) {
            // Double-tap → like
            if (!liked) onToggleLike(post.id);
            setHeartFlash(true);
            setTimeout(() => setHeartFlash(false), 800);
            return;
        }

        if (post.videoUrl) {
            if (dataSaver && !videoUnlocked) {
                // First tap in data saver mode → unlock and play
                setVideoUnlocked(true);
            } else {
                // Toggle pause
                setVideoPaused(v => !v);
            }
        }
    };

    const branchLabel = post.subCategory
        ? `${SUB_EMOJI[post.subCategory] || ''} ${post.subCategory}`
        : `🌐 ${post.category}`;

    const hasMedia = !!(post.imageUrl || post.videoUrl);
    const showDataSaverCover = post.videoUrl && dataSaver && !videoUnlocked;
    const showPauseHint = post.videoUrl && isVisible && !showDataSaverCover && videoPaused;

    return (
        <View style={s.post}>

            {/* Header */}
            <View style={s.postHeader}>
                <View style={s.avatar}>
                    {post.user?.avatar
                        ? <Image source={{ uri: post.user.avatar }} style={s.avatarImg} />
                        : <Text style={s.avatarLetter}>{post.user?.username?.[0]?.toUpperCase() || '?'}</Text>
                    }
                </View>
                <View style={s.postInfo}>
                    <Text style={s.postUsername}>{post.user?.username}</Text>
                    <Text style={s.postMeta}>{branchLabel} · {timeAgo(post.createdAt)}</Text>
                </View>
                <Text style={s.moreBtn}>⋯</Text>
            </View>

            {/* Media */}
            {hasMedia && (
                <TouchableWithoutFeedback onPress={handleTap}>
                    <View style={s.mediaWrap}>
                        {post.videoUrl ? (
                            <View style={[s.media, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
                                <Text style={{ color: '#fff', fontSize: 32 }}>▶</Text>
                            </View>
                        ) : (
                            <Image source={{ uri: post.imageUrl }} style={s.media} resizeMode="cover" />
                        )}

                        {/* Data saver cover — tap to unlock */}
                        {showDataSaverCover && (
                            <View style={s.dataSaverCover} pointerEvents="none">
                                <Text style={s.dataSaverPlayIcon}>▶</Text>
                                <Text style={s.dataSaverText}>Veri tasarrufu · oynatmak için dokun</Text>
                            </View>
                        )}

                        {/* Pause hint */}
                        {showPauseHint && (
                            <View style={s.pauseCover} pointerEvents="none">
                                <Text style={s.pauseHintIcon}>▶</Text>
                            </View>
                        )}

                        {/* Double-tap heart flash */}
                        {heartFlash && (
                            <View style={s.heartFlash} pointerEvents="none">
                                <Text style={{ fontSize: 80 }}>❤️</Text>
                            </View>
                        )}
                    </View>
                </TouchableWithoutFeedback>
            )}

            {/* Actions */}
            <View style={s.actions}>
                <View style={s.actionsLeft}>
                    <TouchableOpacity onPress={() => onToggleLike(post.id)} style={s.actionBtn} activeOpacity={0.7}>
                        <Text style={[s.actionIcon, liked && s.iconLiked]}>{liked ? '❤️' : '🤍'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} activeOpacity={0.7}>
                        <Text style={s.actionIcon}>💬</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} activeOpacity={0.7}>
                        <Text style={[s.actionIcon, { fontSize: 20, color: '#fff' }]}>↗</Text>
                    </TouchableOpacity>
                </View>
                <TouchableOpacity style={s.actionBtn} activeOpacity={0.7}>
                    <Text style={s.actionIcon}>🔖</Text>
                </TouchableOpacity>
            </View>

            {/* Likes */}
            {post._count?.likes > 0 && (
                <Text style={s.likesCount}>{post._count.likes.toLocaleString('tr-TR')} beğeni</Text>
            )}

            {/* Caption */}
            {!!post.content && (
                <View style={s.captionWrap}>
                    <Text style={s.captionText}>
                        <Text style={s.captionUser}>{post.user?.username}  </Text>
                        {post.content}
                    </Text>
                </View>
            )}

            {/* Comments hint */}
            {post._count?.comments > 0 && (
                <Text style={s.commentsHint}>{post._count.comments} yorumun tamamını gör</Text>
            )}

            {/* Music bar */}
            {!!post.musicName && (
                <TouchableOpacity
                    style={[s.musicBar, isMusicPlaying && s.musicBarActive]}
                    onPress={() => onMusicTap(post)}
                    activeOpacity={0.8}
                >
                    {post.musicCoverUrl ? (
                        <Image source={{ uri: post.musicCoverUrl }} style={s.musicCover} />
                    ) : (
                        <View style={[s.musicCover, s.musicCoverFallback]}>
                            <Text style={{ fontSize: 14 }}>🎵</Text>
                        </View>
                    )}
                    <View style={{ flex: 1 }}>
                        <Text style={s.musicName} numberOfLines={1}>{post.musicName}</Text>
                        {!!post.musicArtist && (
                            <Text style={s.musicArtist} numberOfLines={1}>{post.musicArtist}</Text>
                        )}
                    </View>
                    <View style={[s.musicPlayBtn, isMusicPlaying && s.musicPlayBtnActive]}>
                        <Text style={[s.musicPlayIcon, isMusicPlaying && { color: '#fff' }]}>
                            {isMusicPlaying ? '⏸' : '▶'}
                        </Text>
                    </View>
                </TouchableOpacity>
            )}

        </View>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function UserPostsScreen({ route, navigation }) {
    const { userId, username } = route.params;

    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [likedIds, setLikedIds] = useState(new Set());
    const [visiblePostId, setVisiblePostId] = useState(null);
    const [dataSaver, setDataSaver] = useState(false);
    const [playingMusicPostId, setPlayingMusicPostId] = useState(null);

    const soundRef = useRef(null);
    const postsRef = useRef([]);
    const dataSaverRef = useRef(false);

    // Keep refs in sync with state
    useEffect(() => { dataSaverRef.current = dataSaver; }, [dataSaver]);
    useEffect(() => { postsRef.current = posts; }, [posts]);

    const stopSound = useCallback(async () => {
        if (soundRef.current) {
            try {
                await soundRef.current.stopAsync();
                await soundRef.current.unloadAsync();
            } catch (_) {}
            soundRef.current = null;
        }
        setPlayingMusicPostId(null);
    }, []);

    const startMusic = useCallback(async (post) => {
        if (!post?.musicUrl) return;
        if (soundRef.current) {
            try {
                await soundRef.current.stopAsync();
                await soundRef.current.unloadAsync();
            } catch (_) {}
            soundRef.current = null;
        }
        try {
            if (!Audio || !Audio.Sound || typeof Audio.Sound.createAsync !== 'function') return;
            const { sound } = await Audio.Sound.createAsync(
                { uri: post.musicUrl },
                { shouldPlay: true, isLooping: false }
            );
            soundRef.current = sound;
            setPlayingMusicPostId(post.id);
            sound.setOnPlaybackStatusUpdate(status => {
                if (status.didJustFinish) {
                    soundRef.current = null;
                    setPlayingMusicPostId(null);
                }
            });
        } catch (_) { /* silent fail */ }
    }, []);

    // Mount: setup audio + load prefs + fetch posts
    useEffect(() => {
        try {
            Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
        } catch (_) {}

        AsyncStorage.getItem('activity_data_saver').then(v => {
            const val = v === 'true';
            setDataSaver(val);
            dataSaverRef.current = val;
        }).catch(() => {});

        api.get(`/posts/user/${userId}?type=POST`)
            .then(({ data }) => {
                const list = Array.isArray(data) ? data : [];
                postsRef.current = list;
                setPosts(list);
                setLikedIds(new Set(list.filter(p => p.isLiked).map(p => p.id)));
            })
            .catch(e => console.warn(e?.message))
            .finally(() => setLoading(false));

        return () => { stopSound(); };
    }, [userId]); // eslint-disable-line

    // Auto-play music when visible post changes
    useEffect(() => {
        if (dataSaverRef.current) {
            stopSound();
            return;
        }
        const visible = postsRef.current.find(p => p.id === visiblePostId);
        if (visible?.musicUrl && !visible?.videoUrl) {
            startMusic(visible);
        } else {
            stopSound();
        }
    }, [visiblePostId]); // eslint-disable-line

    const handleMusicTap = useCallback(async (post) => {
        if (playingMusicPostId === post.id) {
            await stopSound();
        } else {
            await startMusic(post);
        }
    }, [playingMusicPostId, stopSound, startMusic]);

    const toggleLike = useCallback(async (postId) => {
        const already = likedIds.has(postId);
        setLikedIds(prev => {
            const s = new Set(prev);
            already ? s.delete(postId) : s.add(postId);
            return s;
        });
        setPosts(prev => prev.map(p =>
            p.id === postId
                ? { ...p, _count: { ...p._count, likes: (p._count?.likes || 0) + (already ? -1 : 1) } }
                : p
        ));
        try {
            already
                ? await api.delete(`/posts/${postId}/like`)
                : await api.post(`/posts/${postId}/like`);
        } catch (_) {
            setLikedIds(prev => {
                const s = new Set(prev);
                already ? s.add(postId) : s.delete(postId);
                return s;
            });
        }
    }, [likedIds]);

    // Stable FlatList callbacks
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;
    const onViewableItemsChanged = useRef(({ viewableItems }) => {
        const first = viewableItems.find(v => v.isViewable);
        setVisiblePostId(first?.item?.id ?? null);
    }).current;

    const renderItem = useCallback(({ item }) => (
        <PostCard
            post={item}
            liked={likedIds.has(item.id)}
            onToggleLike={toggleLike}
            isVisible={visiblePostId === item.id}
            dataSaver={dataSaver}
            isMusicPlaying={playingMusicPostId === item.id}
            onMusicTap={handleMusicTap}
        />
    ), [likedIds, toggleLike, visiblePostId, dataSaver, playingMusicPostId, handleMusicTap]);

    return (
        <View style={s.container}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.headerTitle}>@{username}</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator size="large" color={colors.purple} />
                </View>
            ) : posts.length === 0 ? (
                <View style={s.center}>
                    <Text style={{ fontSize: 48, opacity: 0.3 }}>📷</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 12 }}>Henüz gönderi yok</Text>
                </View>
            ) : (
                <FlatList
                    data={posts}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={s.separator} />}
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                />
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container:      { flex: 1, backgroundColor: colors.bg },
    center:         { flex: 1, justifyContent: 'center', alignItems: 'center' },

    header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 1, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: colors.surface2 },
    backBtn:        { padding: 5 },
    backText:       { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 34 },
    headerTitle:    { color: '#fff', fontSize: 15, fontWeight: '900' },
    separator:      { height: 8, backgroundColor: colors.surface2 },

    post:           { backgroundColor: colors.bg },
    postHeader:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 7 },
    avatar:         { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.purple + '50', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    avatarImg:      { width: 38, height: 38, borderRadius: 19 },
    avatarLetter:   { color: '#fff', fontWeight: '900', fontSize: 15 },
    postInfo:       { flex: 1, marginLeft: 10 },
    postUsername:   { color: '#fff', fontSize: 13, fontWeight: '800' },
    postMeta:       { color: colors.textMuted, fontSize: 11, marginTop: 1 },
    moreBtn:        { color: colors.textMuted, fontSize: 20, paddingLeft: 7 },

    mediaWrap:      { width: SCREEN_W, aspectRatio: 1, backgroundColor: colors.surface, overflow: 'hidden' },
    media:          { width: '100%', height: '100%' },

    dataSaverCover: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center', gap: 3 },
    dataSaverPlayIcon: { color: '#fff', fontSize: 48 },
    dataSaverText:  { color: '#ffffffbb', fontSize: 11, fontWeight: '600', textAlign: 'center' },

    pauseCover:     { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000040', justifyContent: 'center', alignItems: 'center' },
    pauseHintIcon:  { color: '#fff', fontSize: 52, opacity: 0.85 },

    heartFlash:     { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },

    actions:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, paddingTop: 5, paddingBottom: 1 },
    actionsLeft:    { flexDirection: 'row', gap: 3, flex: 1 },
    actionBtn:      { padding: 3 },
    actionIcon:     { fontSize: 24 },
    iconLiked:      { color: '#f87171' },

    likesCount:     { color: '#fff', fontSize: 13, fontWeight: '800', paddingHorizontal: 11, marginBottom: 4 },
    captionWrap:    { paddingHorizontal: 11, marginBottom: 4 },
    captionUser:    { color: '#fff', fontSize: 13, fontWeight: '800' },
    captionText:    { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    commentsHint:   { color: colors.textMuted, fontSize: 13, paddingHorizontal: 11, marginBottom: 6 },

    musicBar:           { flexDirection: 'row', alignItems: 'center', gap: 3, marginHorizontal: 12, marginBottom: 12, marginTop: 4, backgroundColor: colors.surface2, borderRadius: 12, padding: 7 },
    musicBarActive:     { borderWidth: 1, borderColor: colors.purple + '80' },
    musicCover:         { width: 40, height: 40, borderRadius: 8 },
    musicCoverFallback: { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
    musicName:          { color: '#fff', fontSize: 12, fontWeight: '700' },
    musicArtist:        { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    musicPlayBtn:       { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
    musicPlayBtnActive: { backgroundColor: colors.purple },
    musicPlayIcon:      { color: colors.purple, fontSize: 13, fontWeight: '900' },
});
