import { useState, useCallback, useRef, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, TextInput,
    ScrollView, Image, Platform, Alert, ActivityIndicator, Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
// expo-av SDK 54 Expo Go'da çalışmıyor — null stub ile güvenli kullanım
const Audio = null;
import api from '../../services/api';
import colors from '../../theme/colors';

const ASPECT_RATIOS = [
    { key: '1:1',  label: '1:1',  ratio: [1, 1],   desc: 'Kare' },
    { key: '4:5',  label: '4:5',  ratio: [4, 5],   desc: 'Dikey' },
    { key: '16:9', label: '16:9', ratio: [16, 9],  desc: 'Yatay' },
];

const ALL_BRANCHES = [
    { key: 'GENERAL',       label: '🌐 Genel',           category: 'SPORTS', subCategory: null,            isGeneral: true },
    { key: 'football',      label: '⚽ Futbol',           category: 'SPORTS', subCategory: 'football' },
    { key: 'basketball',    label: '🏀 Basketbol',        category: 'SPORTS', subCategory: 'basketball' },
    { key: 'tennis',        label: '🎾 Tenis',            category: 'SPORTS', subCategory: 'tennis' },
    { key: 'padel',         label: '🏓 Padel',            category: 'SPORTS', subCategory: 'padel' },
    { key: 'volleyball',    label: '🏐 Voleybol',         category: 'SPORTS', subCategory: 'volleyball' },
    { key: 'swimming',      label: '🏊 Yüzme',            category: 'SPORTS', subCategory: 'swimming' },
    { key: 'running',       label: '🏃 Koşu',             category: 'SPORTS', subCategory: 'running' },
    { key: 'cycling',       label: '🚴 Bisiklet',         category: 'SPORTS', subCategory: 'cycling' },
    { key: 'boxing',        label: '🥊 Boks',             category: 'SPORTS', subCategory: 'boxing' },
    { key: 'martial_arts',  label: '🥋 Dövüş Sanatları',  category: 'SPORTS', subCategory: 'martial_arts' },
    { key: 'wellness',      label: '🧘 Yoga/Pilates',     category: 'SPORTS', subCategory: 'wellness' },
    { key: 'music',         label: '🎵 Müzik',            category: 'ARTS',   subCategory: 'music' },
    { key: 'painting',      label: '🎨 Resim',            category: 'ARTS',   subCategory: 'painting' },
    { key: 'dance',         label: '💃 Dans',             category: 'ARTS',   subCategory: 'dance' },
    { key: 'photography',   label: '📸 Fotoğraf',         category: 'ARTS',   subCategory: 'photography' },
    { key: 'theater',       label: '🎭 Tiyatro',          category: 'ARTS',   subCategory: 'theater' },
    { key: 'writing',       label: '✍️ Yazarlık',         category: 'ARTS',   subCategory: 'writing' },
    { key: 'sculpture',     label: '🗿 Heykel',           category: 'ARTS',   subCategory: 'sculpture' },
    { key: 'cinema',        label: '🎬 Sinema',           category: 'ARTS',   subCategory: 'cinema' },
    { key: 'poetry',        label: '📜 Şiir',             category: 'ARTS',   subCategory: 'poetry' },
    { key: 'illustration',  label: '🖼️ İllüstrasyon',    category: 'ARTS',   subCategory: 'illustration' },
    { key: 'fps',           label: '🎯 FPS',              category: 'GAMES',  subCategory: 'fps' },
    { key: 'rpg',           label: '⚔️ RPG',              category: 'GAMES',  subCategory: 'rpg' },
    { key: 'strategy',      label: '♟️ Strateji',         category: 'GAMES',  subCategory: 'strategy' },
    { key: 'sports_games',  label: '🎮 Spor Oyunları',    category: 'GAMES',  subCategory: 'sports_games' },
    { key: 'moba',          label: '🏆 MOBA',             category: 'GAMES',  subCategory: 'moba' },
    { key: 'battle_royale', label: '💥 Battle Royale',    category: 'GAMES',  subCategory: 'battle_royale' },
    { key: 'simulation',    label: '🌍 Simülasyon',       category: 'GAMES',  subCategory: 'simulation' },
    { key: 'puzzle',        label: '🧩 Bulmaca',          category: 'GAMES',  subCategory: 'puzzle' },
    { key: 'racing',        label: '🏎️ Yarış',            category: 'GAMES',  subCategory: 'racing' },
    { key: 'card_games',    label: '🃏 Kart Oyunları',    category: 'GAMES',  subCategory: 'card_games' },
];

export default function CreatePostScreen({ navigation }) {
    const [media, setMedia] = useState(null);
    const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0]);
    const [content, setContent] = useState('');
    const [branch, setBranch] = useState(ALL_BRANCHES[0]);
    const [posting, setPosting] = useState(false);

    // Music
    const [selectedTrack, setSelectedTrack] = useState(null);
    const [musicSearchOpen, setMusicSearchOpen] = useState(false);
    const [musicQuery, setMusicQuery] = useState('');
    const [musicResults, setMusicResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [playingId, setPlayingId] = useState(null);
    const soundRef = useRef(null);
    const searchTimeout = useRef(null);

    useEffect(() => {
        try { Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {}); } catch (_) {}
        return () => { stopSound(); };
    }, []);

    const stopSound = async () => {
        if (soundRef.current) {
            try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch (_) {}
            soundRef.current = null;
        }
        setPlayingId(null);
    };

    const closeMusicModal = () => {
        stopSound();
        setMusicSearchOpen(false);
        setMusicQuery('');
        setMusicResults([]);
    };

    const searchDeezer = useCallback((q) => {
        clearTimeout(searchTimeout.current);
        if (!q.trim()) { setMusicResults([]); return; }
        searchTimeout.current = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=15&output=json`);
                const json = await res.json();
                setMusicResults(json.data || []);
            } catch (_) { setMusicResults([]); }
            finally { setSearching(false); }
        }, 500);
    }, []);

    const togglePreview = async (track) => {
        if (playingId === track.id) {
            await stopSound();
            return;
        }
        await stopSound();
        try {
            if (!Audio || !Audio.Sound || typeof Audio.Sound.createAsync !== 'function') return;
            const { sound } = await Audio.Sound.createAsync(
                { uri: track.preview },
                { shouldPlay: true }
            );
            soundRef.current = sound;
            setPlayingId(track.id);
            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.didJustFinish) { soundRef.current = null; setPlayingId(null); }
            });
        } catch (_) { setPlayingId(null); }
    };

    const selectTrack = (track) => {
        setSelectedTrack({
            id: track.id,
            title: track.title,
            artist: track.artist.name,
            coverUrl: track.album.cover_small,
            previewUrl: track.preview,
        });
        closeMusicModal();
    };

    const pickMedia = useCallback(async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
            Alert.alert('İzin gerekli', 'Galeri erişimine izin verin.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: true,
            aspect: aspectRatio.ratio,
            quality: 0.92,
            videoMaxDuration: 60,
        });
        if (!result.canceled) {
            const asset = result.assets[0];
            setMedia({ uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image' });
        }
    }, [aspectRatio]);

    const changeAspect = (ar) => {
        setAspectRatio(ar);
        // only reset if no media yet; existing media just adapts its display ratio
    };

    const handlePost = async () => {
        if (!content.trim() && !media) return;
        setPosting(true);
        try {
            let imageUrl = null;
            let videoUrl = null;

            if (media) {
                const filename = media.uri.split('/').pop();
                const ext = filename.split('.').pop()?.toLowerCase() || '';
                const mimeType = media.type === 'video'
                    ? (ext === 'mov' ? 'video/quicktime' : `video/${ext || 'mp4'}`)
                    : `image/${ext || 'jpeg'}`;
                const formData = new FormData();
                formData.append('file', { uri: media.uri, type: mimeType, name: filename });
                const { data: uploadData } = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                if (media.type === 'image') imageUrl = uploadData.url;
                else videoUrl = uploadData.url;
            }

            const isGeneral = branch?.isGeneral;
            const category = isGeneral ? 'SPORTS' : branch.category;
            const subCategory = isGeneral ? null : branch.subCategory;
            const targets = isGeneral ? null : [{ category, subCategory }];

            await api.post('/posts', {
                type: 'POST',
                category,
                subCategory,
                content: content.trim(),
                targets,
                imageUrl,
                videoUrl,
                ...(selectedTrack && {
                    musicName: selectedTrack.title,
                    musicArtist: selectedTrack.artist,
                    musicCoverUrl: selectedTrack.coverUrl,
                    musicUrl: selectedTrack.previewUrl,
                }),
            });

            navigation.goBack();
        } catch (e) {
            console.warn(e?.message);
            Alert.alert('Hata', 'Gönderi paylaşılamadı.');
        } finally {
            setPosting(false);
        }
    };

    const canPost = (!!content.trim() || !!media) && !posting;

    const previewAspect = aspectRatio.key === '1:1' ? 1
        : aspectRatio.key === '4:5' ? 4 / 5
        : 16 / 9;

    return (
        <View style={s.container}>
            {/* ── Header ── */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerSide}>
                    <Text style={s.cancelText}>İptal</Text>
                </TouchableOpacity>
                <Text style={s.headerTitle}>Yeni Gönderi</Text>
                <TouchableOpacity onPress={handlePost} disabled={!canPost} style={s.headerSide}>
                    {posting
                        ? <ActivityIndicator size="small" color={colors.purple} />
                        : <Text style={[s.shareText, !canPost && { opacity: 0.35 }]}>Paylaş</Text>
                    }
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* ── Media preview / picker ── */}
                <TouchableOpacity onPress={pickMedia} activeOpacity={0.85} style={[s.mediaPicker, { aspectRatio: previewAspect }]}>
                    {media ? (
                        media.type === 'image' ? (
                            <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        ) : (
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
                                <Text style={{ color: '#fff', fontSize: 40 }}>▶</Text>
                                <Text style={{ color: '#aaa', fontSize: 11, marginTop: 6 }}>Video</Text>
                            </View>
                        )
                    ) : (
                        <View style={s.mediaEmpty}>
                            <Text style={s.mediaEmptyIcon}>＋</Text>
                            <Text style={s.mediaEmptyText}>Fotoğraf veya Video Seç</Text>
                            <Text style={s.mediaEmptyHint}>Galerinizden seçin, kırpın</Text>
                        </View>
                    )}
                    {media && (
                        <View style={s.rePickOverlay}>
                            <Text style={s.rePickText}>✎ Değiştir</Text>
                        </View>
                    )}
                </TouchableOpacity>

                {/* ── Aspect ratio ── */}
                <View style={s.aspectRow}>
                    <Text style={s.aspectLabel}>Oran</Text>
                    {ASPECT_RATIOS.map(ar => (
                        <TouchableOpacity
                            key={ar.key}
                            onPress={() => changeAspect(ar)}
                            style={[s.aspectBtn, aspectRatio.key === ar.key && s.aspectBtnActive]}
                        >
                            <Text style={[s.aspectBtnText, aspectRatio.key === ar.key && { color: '#fff' }]}>
                                {ar.label}
                            </Text>
                            <Text style={[s.aspectBtnDesc, aspectRatio.key === ar.key && { color: colors.purpleLight }]}>
                                {ar.desc}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={s.fields}>

                    {/* ── Caption ── */}
                    <TextInput
                        style={s.captionInput}
                        value={content}
                        onChangeText={setContent}
                        placeholder="Bir şeyler yaz..."
                        placeholderTextColor={colors.textMuted}
                        multiline
                        maxLength={2200}
                    />
                    <Text style={s.charCount}>{content.length}/2200</Text>

                    <View style={s.divider} />

                    {/* ── Music ── */}
                    {selectedTrack ? (
                        <View style={s.trackCard}>
                            {selectedTrack.coverUrl
                                ? <Image source={{ uri: selectedTrack.coverUrl }} style={s.trackCover} />
                                : <View style={[s.trackCover, { backgroundColor: colors.surface2, justifyContent: 'center', alignItems: 'center' }]}><Text>🎵</Text></View>
                            }
                            <View style={{ flex: 1 }}>
                                <Text style={s.trackTitle} numberOfLines={1}>{selectedTrack.title}</Text>
                                <Text style={s.trackArtist} numberOfLines={1}>{selectedTrack.artist}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setSelectedTrack(null)} style={{ paddingLeft: 8 }}>
                                <Text style={{ color: colors.textMuted, fontSize: 16 }}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity style={s.musicBtn} onPress={() => setMusicSearchOpen(true)}>
                            <Text style={s.musicBtnIcon}>🎵</Text>
                            <Text style={s.musicBtnText}>Müzik Ekle</Text>
                        </TouchableOpacity>
                    )}

                    <View style={s.divider} />

                    {/* ── Branch / Dal ── */}
                    <Text style={s.sectionLabel}>Dal</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, paddingHorizontal: 20 }}>
                        {ALL_BRANCHES.map(b => (
                            <TouchableOpacity
                                key={b.key}
                                onPress={() => setBranch(b)}
                                style={[s.branchChip, branch?.key === b.key && s.branchChipActive]}
                            >
                                <Text style={[s.branchChipText, branch?.key === b.key && { color: '#fff' }]}>
                                    {b.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                </View>
            </ScrollView>

            {/* ── Music Search Modal ── */}
            <Modal visible={musicSearchOpen} animationType="slide" onRequestClose={closeMusicModal}>
                <View style={s.musicModal}>
                    {/* Modal header */}
                    <View style={s.musicModalHeader}>
                        <TouchableOpacity onPress={closeMusicModal}>
                            <Text style={s.musicModalClose}>İptal</Text>
                        </TouchableOpacity>
                        <Text style={s.musicModalTitle}>🎵 Müzik Seç</Text>
                        <View style={{ width: 48 }} />
                    </View>

                    {/* Search input */}
                    <View style={s.musicSearchRow}>
                        <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
                        <TextInput
                            style={s.musicSearchInput}
                            value={musicQuery}
                            onChangeText={(q) => { setMusicQuery(q); searchDeezer(q); }}
                            placeholder="Şarkı veya sanatçı ara..."
                            placeholderTextColor={colors.textMuted}
                            autoFocus
                            returnKeyType="search"
                        />
                        {musicQuery.length > 0 && (
                            <TouchableOpacity onPress={() => { setMusicQuery(''); setMusicResults([]); }}>
                                <Text style={{ color: colors.textMuted, fontSize: 16, paddingLeft: 8 }}>✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Results */}
                    {searching ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />
                    ) : musicResults.length === 0 && musicQuery.length > 0 ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Sonuç bulunamadı</Text>
                        </View>
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            {musicResults.map(track => (
                                <TouchableOpacity
                                    key={track.id}
                                    style={s.trackRow}
                                    onPress={() => selectTrack(track)}
                                    activeOpacity={0.75}
                                >
                                    <Image source={{ uri: track.album.cover_small }} style={s.trackRowCover} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.trackRowTitle} numberOfLines={1}>{track.title}</Text>
                                        <Text style={s.trackRowArtist} numberOfLines={1}>{track.artist.name}</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={s.previewBtn}
                                        onPress={() => togglePreview(track)}
                                    >
                                        <Text style={s.previewBtnText}>
                                            {playingId === track.id ? '⏸' : '▶'}
                                        </Text>
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}

                    {musicQuery.length === 0 && musicResults.length === 0 && (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 40 }}>🎵</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Şarkı adı veya sanatçı gir</Text>
                        </View>
                    )}
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    container:       { flex: 1, backgroundColor: colors.bg },

    header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.surface2 },
    headerSide:      { minWidth: 60 },
    headerTitle:     { color: '#fff', fontSize: 16, fontWeight: '900', textAlign: 'center' },
    cancelText:      { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
    shareText:       { color: colors.purple, fontSize: 15, fontWeight: '900', textAlign: 'right' },

    mediaPicker:     { width: '100%', backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    mediaEmpty:      { alignItems: 'center', gap: 10 },
    mediaEmptyIcon:  { fontSize: 48, color: colors.textMuted },
    mediaEmptyText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
    mediaEmptyHint:  { color: colors.textMuted, fontSize: 12 },
    rePickOverlay:   { position: 'absolute', bottom: 10, right: 10, backgroundColor: '#000000bb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
    rePickText:      { color: '#fff', fontSize: 12, fontWeight: '700' },

    aspectRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface },
    aspectLabel:     { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginRight: 4 },
    aspectBtn:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center' },
    aspectBtnActive: { backgroundColor: colors.purple },
    aspectBtnText:   { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
    aspectBtnDesc:   { color: colors.textMuted, fontSize: 9, fontWeight: '600', marginTop: 1 },

    fields:          { padding: 20, gap: 0 },
    captionInput:    { color: '#fff', fontSize: 15, lineHeight: 22, minHeight: 80, textAlignVertical: 'top', paddingTop: 0 },
    charCount:       { color: colors.textMuted, fontSize: 10, textAlign: 'right', marginBottom: 12 },

    divider:         { height: 1, backgroundColor: colors.surface2, marginVertical: 12 },

    sectionLabel:    { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 10, letterSpacing: 0.5 },
    branchChip:      { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.surface2, marginRight: 8 },
    branchChipActive:{ backgroundColor: colors.purple },
    branchChipText:  { color: colors.textMuted, fontSize: 12, fontWeight: '700' },

    // Music button (no track selected)
    musicBtn:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    musicBtnIcon:    { fontSize: 20 },
    musicBtnText:    { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },

    // Selected track card
    trackCard:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface2, borderRadius: 12, padding: 10 },
    trackCover:      { width: 44, height: 44, borderRadius: 8 },
    trackTitle:      { color: '#fff', fontSize: 13, fontWeight: '700' },
    trackArtist:     { color: colors.textMuted, fontSize: 11, marginTop: 2 },

    // Music search modal
    musicModal:      { flex: 1, backgroundColor: colors.bg },
    musicModalHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.surface2 },
    musicModalTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
    musicModalClose: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },

    musicSearchRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, margin: 16, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
    musicSearchInput:{ flex: 1, color: '#fff', fontSize: 14 },

    trackRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surface2 },
    trackRowCover:   { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surface2 },
    trackRowTitle:   { color: '#fff', fontSize: 13, fontWeight: '700' },
    trackRowArtist:  { color: colors.textMuted, fontSize: 11, marginTop: 2 },

    previewBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.purple + '30', justifyContent: 'center', alignItems: 'center' },
    previewBtnText:  { color: colors.purple, fontSize: 14, fontWeight: '900' },
});
