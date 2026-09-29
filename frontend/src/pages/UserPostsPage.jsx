import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Navbar from '../components/Navbar';

const SUB_EMOJI = {
    football:'⚽', basketball:'🏀', tennis:'🎾', padel:'🏓', volleyball:'🏐',
    swimming:'🏊', running:'🏃', cycling:'🚴', boxing:'🥊', martial_arts:'🥋', wellness:'🧘',
    table_tennis:'🏓', climbing:'🧗', archery:'🏹', walking:'🚶', foot_tennis:'🦶',
    sup_kano:'🛶', handball:'🤾', badminton:'🏸', shooting_hunting:'🔫', equestrian:'🐎',
    golf:'⛳', fitness_gym:'🏋️', skiing_snowboard:'⛷️', ice_skating:'⛸️', hiking:'🥾',
    camping:'🏕️', motorcycle:'🏍️', extreme_sports:'🪂', paintball:'🎯', airsoft:'🪖',
    music:'🎵', painting:'🎨', dance:'💃', photography:'📸', theater:'🎭',
    writing:'✍️', sculpture:'🗿', cinema:'🎬', poetry:'📜', illustration:'🖼️',
    fps:'🎯', rpg:'⚔️', strategy:'♟️', sports_games:'🎮', moba:'🏆',
    battle_royale:'💥', simulation:'🌍', puzzle:'🧩', racing:'🏎️', card_games:'🃏',
};
const LOCALE = { tr: 'tr-TR', en: 'en-GB', ru: 'ru-RU', de: 'de-DE' };

function useTimeAgo() {
    const { t, i18n } = useTranslation();
    return (dateStr) => {
        const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
        if (m < 1) return t('userPosts.justNow');
        if (m < 60) return t('userPosts.minutesAgo', { count: m });
        const h = Math.floor(m / 60);
        if (h < 24) return t('userPosts.hoursAgo', { count: h });
        const d = Math.floor(h / 24);
        if (d < 7) return t('userPosts.daysAgo', { count: d });
        return new Date(dateStr).toLocaleDateString(LOCALE[i18n.language] || 'en-GB');
    };
}

function Caption({ text }) {
    return text.split(/(@[\w.]+)/g).map((part, i) =>
        part.startsWith('@')
            ? <span key={i} className="text-purple-300 font-bold">{part}</span>
            : <span key={i}>{part}</span>);
}

function PostCard({ post, liked, onToggleLike }) {
    const { t } = useTranslation();
    const timeAgo = useTimeAgo();
    const lastTap = useRef(0);
    const [heartFlash, setHeartFlash] = useState(false);

    // Çift tıklama Instagram gibi yalnızca beğenir, beğeniyi geri almaz
    const handleMediaClick = () => {
        const now = Date.now();
        if (now - lastTap.current < 280) {
            if (!liked) onToggleLike(post.id);
            setHeartFlash(true);
            setTimeout(() => setHeartFlash(false), 700);
        }
        lastTap.current = now;
    };

    const branchLabel = post.subCategory
        ? `${SUB_EMOJI[post.subCategory] || ''} ${post.subCategory}`
        : `🏷️ ${post.category || ''}`;
    const likes = post._count?.likes || 0;
    const comments = post._count?.comments || 0;

    return (
        <article className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <header className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {post.user?.avatar
                        ? <img src={post.user.avatar} alt="" className="w-full h-full object-cover" />
                        : <span className="text-white text-sm font-black">{post.user?.username?.[0]?.toUpperCase() || '?'}</span>}
                </div>
                <div className="min-w-0">
                    <p className="text-white text-sm font-bold truncate">{post.user?.username}</p>
                    <p className="text-gray-500 text-xs truncate">{branchLabel} · {timeAgo(post.createdAt)}</p>
                </div>
            </header>

            {(post.imageUrl || post.videoUrl) && (
                <div className="relative bg-black" onClick={handleMediaClick}>
                    {post.videoUrl
                        ? <video src={post.videoUrl} className="w-full max-h-[70vh] object-contain" controls playsInline loop />
                        : <img src={post.imageUrl} alt="" className="w-full max-h-[70vh] object-contain select-none" draggable={false} />}
                    {heartFlash && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-7xl drop-shadow-lg animate-ping">❤️</span>
                        </div>
                    )}
                </div>
            )}

            <div className="px-4 py-3 space-y-1.5">
                <button onClick={() => onToggleLike(post.id)} className="text-2xl leading-none hover:scale-110 transition">
                    {liked ? '❤️' : '🤍'}
                </button>
                {likes > 0 && <p className="text-white text-sm font-bold">{t('userPosts.likes', { count: likes })}</p>}
                {!!post.content && (
                    <p className="text-gray-200 text-sm whitespace-pre-wrap break-words">
                        <span className="font-bold text-white mr-1.5">{post.user?.username}</span>
                        <Caption text={post.content} />
                    </p>
                )}
                {comments > 0 && <p className="text-gray-500 text-xs">{t('userPosts.comments', { count: comments })}</p>}
                {!!post.musicName && (
                    <div className="flex items-center gap-2 mt-2 bg-gray-800/70 rounded-xl p-2">
                        {post.musicCoverUrl
                            ? <img src={post.musicCoverUrl} alt="" className="w-9 h-9 rounded-lg object-cover" />
                            : <span className="w-9 h-9 rounded-lg bg-gray-700 flex items-center justify-center">🎵</span>}
                        <div className="min-w-0 flex-1">
                            <p className="text-white text-xs font-bold truncate">{post.musicName}</p>
                            {!!post.musicArtist && <p className="text-gray-400 text-[11px] truncate">{post.musicArtist}</p>}
                        </div>
                        {!!post.musicUrl && <audio src={post.musicUrl} controls className="h-8 max-w-[160px]" />}
                    </div>
                )}
            </div>
        </article>
    );
}

export default function UserPostsPage() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [likedIds, setLikedIds] = useState(new Set());

    useEffect(() => {
        setLoading(true);
        api.get(`/posts/user/${userId}?type=POST`)
            .then(({ data }) => {
                const list = Array.isArray(data) ? data : (data.posts || []);
                setPosts(list);
                setLikedIds(new Set(list.filter(p => p.isLiked).map(p => p.id)));
            })
            .catch(() => setPosts([]))
            .finally(() => setLoading(false));
    }, [userId]);

    const toggleLike = async (postId) => {
        const wasLiked = likedIds.has(postId);
        const apply = (liked) => {
            setLikedIds(prev => { const s = new Set(prev); liked ? s.add(postId) : s.delete(postId); return s; });
            setPosts(prev => prev.map(p => p.id === postId
                ? { ...p, _count: { ...p._count, likes: Math.max(0, (p._count?.likes || 0) + (liked ? 1 : -1)) } }
                : p));
        };
        apply(!wasLiked);
        try { await api.post(`/posts/${postId}/like`); } catch { apply(wasLiked); }
    };

    const username = posts[0]?.user?.username;

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <Navbar onBack={() => navigate(-1)} title={username ? `@${username}` : t('userPosts.title')} />
            <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
                {username && (
                    <button onClick={() => navigate(`/profile/${userId}`)} className="text-purple-300 text-sm font-bold hover:underline">
                        @{username} · {t('userPosts.title')}
                    </button>
                )}
                {loading ? (
                    <p className="text-gray-500 text-sm text-center py-16">{t('common.loading')}</p>
                ) : posts.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-5xl opacity-30">📷</p>
                        <p className="text-gray-500 text-sm mt-3">{t('userPosts.empty')}</p>
                    </div>
                ) : (
                    posts.map(post => (
                        <PostCard key={post.id} post={post} liked={likedIds.has(post.id)} onToggleLike={toggleLike} />
                    ))
                )}
            </div>
        </div>
    );
}
