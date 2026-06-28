import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../store/slices/authSlice';
import api from '../services/api';
import CreatePostModal from '../components/CreatePostModal';
import Navbar from '../components/Navbar';
import ContentViewer from '../components/ContentViewer';
import AssessmentModal from '../components/AssessmentModal';

const CATEGORY_CONFIG = {
    SPORTS: { color: 'from-green-500 to-emerald-500', bg: 'bg-green-500/10', border: 'border-green-500/30', path: 'sports' },
    ARTS:   { color: 'from-pink-500 to-rose-500',     bg: 'bg-pink-500/10',  border: 'border-pink-500/30',  path: 'arts'   },
    GAMES:  { color: 'from-blue-500 to-indigo-500',   bg: 'bg-blue-500/10',  border: 'border-blue-500/30',  path: 'games'  },
};

const LEVEL_BADGE = {
    BEGINNER:     { label: '🟢 Beginner',     bg: 'bg-green-500/20 text-green-400'   },
    INTERMEDIATE: { label: '🟡 Intermediate', bg: 'bg-yellow-500/20 text-yellow-400' },
    ADVANCED:     { label: '🟠 Advanced',     bg: 'bg-orange-500/20 text-orange-400' },
    PRO:          { label: '🔴 Pro',          bg: 'bg-red-500/20 text-red-400'       },
};

function Avatar({ user, size = 'lg' }) {
    const sizes = { sm: 'w-8 h-8 text-sm', md: 'w-12 h-12 text-lg', lg: 'w-20 h-20 text-3xl', xl: 'w-28 h-28 text-4xl' };
    if (user?.avatar) return <img src={user.avatar} alt={user.username} className={`${sizes[size]} rounded-full object-cover flex-shrink-0`} />;
    return (
        <div className={`${sizes[size]} rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold flex-shrink-0`}>
            {user?.username?.[0]?.toUpperCase() || '?'}
        </div>
    );
}

const GENDER_OPTIONS = [
    { value: 'MALE',   label: 'Male',   emoji: '♂️' },
    { value: 'FEMALE', label: 'Female', emoji: '♀️' },
    { value: 'OTHER',  label: 'Other',  emoji: '⚧️' },
];

function EditProfileModal({ user, onClose, onSave }) {
    const [form, setForm] = useState({ fullName: user.fullName || '', bio: user.bio || '', isPublic: user.isPublic ?? true, gender: user.gender || '' });
    const [isSaving, setIsSaving] = useState(false);
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try { const { data } = await api.patch('/users/me', form); onSave(data); }
        catch (err) { console.error(err); }
        finally { setIsSaving(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-md">
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-white font-bold text-lg">Edit Profile</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">Full Name</label>
                        <input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })}
                            className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500" />
                    </div>
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">Gender</label>
                        <div className="flex gap-2">
                            {GENDER_OPTIONS.map(g => (
                                <button key={g.value} type="button"
                                    onClick={() => setForm({ ...form, gender: form.gender === g.value ? '' : g.value })}
                                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition ${form.gender === g.value ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                                    {g.emoji} {g.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">Bio</label>
                        <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={3}
                            placeholder="Tell something about yourself..."
                            className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 resize-none" />
                    </div>
                    <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
                        <input type="checkbox" id="isPublic" checked={form.isPublic} onChange={e => setForm({ ...form, isPublic: e.target.checked })} className="w-4 h-4 accent-purple-500 cursor-pointer" />
                        <label htmlFor="isPublic" className="text-gray-300 text-sm cursor-pointer select-none">Public profile</label>
                    </div>
                    <div className="flex gap-3 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl border border-gray-700 hover:bg-gray-700 transition">Cancel</button>
                        <button type="submit" disabled={isSaving} className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-50 transition hover:opacity-90">
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const ENABLED_SUBS = new Set(['tennis', 'padel', 'volleyball']);

function AddActivityModal({ currentInterests, onClose, onAdd, onRemove }) {
    const [categories, setCategories] = useState([]);
    const [activeCategory, setActiveCategory] = useState('SPORTS');
    const [loadingId, setLoadingId] = useState(null);
    useEffect(() => { api.get('/interests/categories').then(({ data }) => setCategories(data.categories || [])); }, []);
    const addedMap = {};
    currentInterests.forEach(i => { addedMap[`${i.category}__${i.subCategory}`] = i.id; });
    const handleAdd = async (category, subCategory) => {
        const key = `${category}__${subCategory}`;
        setLoadingId(key);
        try { const { data } = await api.post('/interests/add', { category, subCategory }); onAdd(data); }
        catch (err) { console.error(err); }
        finally { setLoadingId(null); }
    };
    const handleRemove = async (interestId, category, subCategory) => {
        const key = `${category}__${subCategory}`;
        setLoadingId(key);
        try { await api.delete(`/interests/${interestId}`); onRemove(interestId); }
        catch (err) { console.error(err); }
        finally { setLoadingId(null); }
    };
    const activeCat = categories.find(c => c.id === activeCategory);
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg max-h-[85vh] flex flex-col">
                <div className="flex justify-between items-center px-6 py-5 border-b border-gray-800 flex-shrink-0">
                    <h3 className="text-white font-bold text-lg">🎯 Manage Activities</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>
                <div className="flex gap-2 px-6 py-3 border-b border-gray-800 flex-shrink-0">
                    {[{ id: 'SPORTS', label: '🏃 Sports', color: 'from-green-500 to-emerald-500' }, { id: 'ARTS', label: '🎨 Arts', color: 'from-pink-500 to-rose-500' }, { id: 'GAMES', label: '🎮 Games', color: 'from-blue-500 to-indigo-500' }].map(tab => (
                        <button key={tab.id} onClick={() => setActiveCategory(tab.id)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${activeCategory === tab.id ? `bg-gradient-to-r ${tab.color} text-white` : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {!activeCat ? <p className="text-gray-500 text-center py-8 text-sm">Loading...</p> : (
                        <div className="grid grid-cols-2 gap-2">
                            {activeCat.subCategories.map(sub => {
                                const key = `${activeCategory}__${sub.id}`;
                                const existingId = addedMap[key];
                                const isAdded = !!existingId;
                                const isLoading = loadingId === key;
                                const cfg = CATEGORY_CONFIG[activeCategory];
                                const enabled = ENABLED_SUBS.has(sub.id);
                                return (
                                    <div key={sub.id} className={`flex items-center justify-between rounded-xl px-4 py-3 border transition ${!enabled ? 'bg-gray-800/40 border-gray-700/50 opacity-50' : isAdded ? `${cfg.bg} ${cfg.border}` : 'bg-gray-800 border-gray-700'}`}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-xl flex-shrink-0">{sub.emoji}</span>
                                            <span className="text-white text-sm font-medium truncate">{sub.name}</span>
                                        </div>
                                        {!enabled ? (
                                            <span className="text-gray-500 text-[10px] font-bold ml-2 flex-shrink-0 bg-gray-700/60 px-2 py-0.5 rounded-full">🔧</span>
                                        ) : isAdded ? (
                                            <button onClick={() => handleRemove(existingId, activeCategory, sub.id)} disabled={isLoading}
                                                className="text-red-400 hover:text-red-300 text-xs font-bold ml-2 flex-shrink-0 disabled:opacity-50">
                                                {isLoading ? '...' : '✕'}
                                            </button>
                                        ) : (
                                            <button onClick={() => handleAdd(activeCategory, sub.id)} disabled={isLoading}
                                                className={`bg-gradient-to-r ${cfg.color} text-white text-xs font-bold px-3 py-1 rounded-lg ml-2 flex-shrink-0 disabled:opacity-50`}>
                                                {isLoading ? '...' : '+ Add'}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="px-6 py-4 border-t border-gray-800 flex-shrink-0">
                    <button onClick={onClose} className="w-full bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl border border-gray-700 hover:bg-gray-700 transition text-sm">Done</button>
                </div>
            </div>
        </div>
    );
}

function storyTimeLeft(expiresAt) {
    if (!expiresAt) return null;
    const ms = new Date(expiresAt) - Date.now();
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h` : `${m}m`;
}

function StoryItem({ story, isOwner, onView, onEdit, onDelete }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const left = storyTimeLeft(story.expiresAt);

    return (
        <div className="flex flex-col items-center gap-1 flex-shrink-0 relative">
            {/* Avatar ring */}
            <div className="relative cursor-pointer" onClick={() => { if (!menuOpen) onView(story); }}>
                <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-b from-purple-500 to-pink-500">
                    <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center overflow-hidden">
                        {story.imageUrl
                            ? <img src={story.imageUrl} alt="" className="w-full h-full object-cover rounded-full" />
                            : story.videoUrl
                                ? <span className="text-2xl">🎬</span>
                                : <span className="text-white font-bold text-lg">{story.user?.username?.[0]?.toUpperCase()}</span>
                        }
                    </div>
                </div>
                {left && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gray-900 text-purple-400 text-[9px] font-bold px-1 rounded-full border border-purple-500/30 whitespace-nowrap">
                        {left}
                    </span>
                )}
                {/* Own story 3-dot */}
                {isOwner && (
                    <button
                        onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-gray-700 rounded-full text-white text-[10px] flex items-center justify-center hover:bg-gray-600 border border-gray-600"
                    >
                        ⋯
                    </button>
                )}
            </div>
            <span className="text-gray-400 text-xs truncate w-16 text-center mt-1">
                {story.user?.username || 'story'}
            </span>

            {/* Dropdown */}
            {menuOpen && isOwner && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute top-12 left-0 z-20 bg-gray-800 border border-gray-700 rounded-xl shadow-xl min-w-[140px] overflow-hidden">
                        <button onClick={() => { setMenuOpen(false); onEdit(story); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-gray-200 hover:bg-gray-700 transition text-xs">
                            ✏️ Edit
                        </button>
                        <button onClick={() => { setMenuOpen(false); onDelete(story.id); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-600/20 transition text-xs">
                            🗑️ Delete
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

// Stories strip
function StoriesStrip({ stories, isOwnProfile, onAddStory, onStoryClick, onEditStory, onDeleteStory }) {
    const { t } = useTranslation();
    return (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
            <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
                {isOwnProfile && (
                    <button onClick={onAddStory} className="flex flex-col items-center gap-1.5 flex-shrink-0 group">
                        <div className="w-16 h-16 rounded-full bg-gray-800 border-2 border-dashed border-purple-500/50 flex items-center justify-center text-2xl group-hover:border-purple-400 transition">
                            +
                        </div>
                        <span className="text-gray-400 text-xs">{t('profile.add_story')}</span>
                    </button>
                )}
                {stories.map(story => (
                    <StoryItem
                        key={story.id}
                        story={story}
                        isOwner={isOwnProfile}
                        onView={onStoryClick}
                        onEdit={onEditStory}
                        onDelete={onDeleteStory}
                    />
                ))}
                {stories.length === 0 && !isOwnProfile && (
                    <p className="text-gray-600 text-sm py-4 px-2">{t('profile.no_active_stories')}</p>
                )}
            </div>
        </div>
    );
}

// Post card for profile
// Post/Reel actions menu
function PostActions({ post, isOwner, onEdit, onToggleHide, onDelete }) {
    const [open, setOpen] = useState(false);
    if (!isOwner) return null;
    return (
        <div className="relative" onClick={e => e.stopPropagation()}>
            <button
                onClick={() => setOpen(v => !v)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition text-lg leading-none"
            >
                ⋯
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-9 z-20 bg-gray-800 border border-gray-700 rounded-xl shadow-xl min-w-[160px] overflow-hidden">
                        <button onClick={() => { setOpen(false); onEdit(); }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-gray-200 hover:bg-gray-700 transition text-sm">
                            ✏️ Edit
                        </button>
                        <button onClick={() => { setOpen(false); onToggleHide(); }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-gray-200 hover:bg-gray-700 transition text-sm">
                            {post.hidden ? '👁️ Show in branches' : '🙈 Hide from branches'}
                        </button>
                        <button onClick={() => { setOpen(false); onDelete(); }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-red-400 hover:bg-red-600/20 transition text-sm">
                            🗑️ Delete
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

// Edit modal — works for Post, Reel, Story
function EditPostModal({ post, onClose, onSave }) {
    const [content, setContent]       = useState(post.content || '');
    const [muteVideo, setMuteVideo]   = useState(post.muteVideo || false);
    const [musicUrl, setMusicUrl]     = useState(post.musicUrl || '');
    const [musicName, setMusicName]   = useState(post.musicName || '');
    const [uploadingMusic, setUploadingMusic] = useState(false);
    const [isSaving, setIsSaving]     = useState(false);
    const musicInputRef = useRef(null);
    const isVideo = !!(post.videoUrl);

    const handleMusicUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingMusic(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setMusicUrl(data.url);
            setMusicName(file.name.replace(/\.[^/.]+$/, ''));
        } catch (err) { console.error(err); }
        finally { setUploadingMusic(false); }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { data } = await api.patch(`/posts/${post.id}`, {
                content,
                ...(isVideo && { muteVideo, musicUrl: musicUrl || null, musicName: musicName || null }),
            });
            onSave(data);
            onClose();
        } catch (err) { console.error(err); }
        finally { setIsSaving(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
                    <h3 className="text-white font-bold">✏️ Edit {post.type === 'STORY' ? 'Story' : post.type === 'REEL' ? 'Reel' : 'Post'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {/* Media preview */}
                    {(post.imageUrl || post.videoUrl) && (
                        <div className="rounded-xl overflow-hidden max-h-40 bg-black">
                            {post.videoUrl
                                ? <video src={post.videoUrl} className="w-full max-h-40 object-contain" muted={muteVideo} />
                                : <img src={post.imageUrl} alt="" className="w-full max-h-40 object-cover" />}
                        </div>
                    )}

                    {/* Caption */}
                    <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        rows={3}
                        placeholder="Caption..."
                        className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500 resize-none text-sm"
                    />

                    {/* Video-only options */}
                    {isVideo && (
                        <>
                            {/* Mute toggle */}
                            <div
                                onClick={() => setMuteVideo(v => !v)}
                                className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition ${muteVideo ? 'bg-purple-600/20 border-purple-500' : 'bg-gray-800 border-gray-700 hover:border-gray-500'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">{muteVideo ? '🔇' : '🔊'}</span>
                                    <div>
                                        <p className="text-white text-sm font-bold">Mute original audio</p>
                                        <p className="text-gray-500 text-xs">{muteVideo ? 'Original audio muted' : 'Original audio playing'}</p>
                                    </div>
                                </div>
                                <div className={`w-10 h-5 rounded-full transition-colors relative ${muteVideo ? 'bg-purple-500' : 'bg-gray-600'}`}>
                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${muteVideo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </div>
                            </div>

                            {/* Music */}
                            <div className="space-y-2">
                                <p className="text-gray-400 text-xs font-bold">🎵 Background Music</p>
                                {musicUrl ? (
                                    <div className="bg-gray-800 rounded-xl px-4 py-3 flex items-center gap-3 border border-purple-500/30">
                                        <span className="text-2xl">🎵</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-bold truncate">{musicName || 'Music track'}</p>
                                            <audio src={musicUrl} controls className="w-full h-7 mt-1" style={{ filter: 'invert(0.7)' }} />
                                        </div>
                                        <button onClick={() => { setMusicUrl(''); setMusicName(''); }}
                                            className="text-red-400 hover:text-red-300 text-lg flex-shrink-0">✕</button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => musicInputRef.current?.click()}
                                        disabled={uploadingMusic}
                                        className="w-full flex items-center justify-center gap-2 bg-gray-800 border border-dashed border-gray-600 hover:border-purple-500/50 rounded-xl py-3 text-gray-400 hover:text-white text-sm transition disabled:opacity-50"
                                    >
                                        {uploadingMusic ? '⏳ Uploading...' : '🎵 Upload music file'}
                                    </button>
                                )}
                                <input ref={musicInputRef} type="file" accept="audio/*" onChange={handleMusicUpload} className="hidden" />
                            </div>
                        </>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-gray-800 flex gap-3">
                    <button onClick={onClose} className="flex-1 bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl border border-gray-700 hover:bg-gray-700 transition text-sm">Cancel</button>
                    <button onClick={handleSave} disabled={isSaving} className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-50 transition text-sm">
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Comment section shown below media posts
function CommentSection({ postId }) {
    const [open, setOpen]         = useState(false);
    const [comments, setComments] = useState([]);
    const [loading, setLoading]   = useState(false);
    const [text, setText]         = useState('');
    const [posting, setPosting]   = useState(false);
    const [count, setCount]       = useState(null);

    const load = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const { data } = await api.get(`/posts/${postId}/comments`);
            setComments(data);
            setCount(data.length);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    };

    const toggle = () => {
        if (!open) load();
        setOpen(v => !v);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!text.trim() || posting) return;
        setPosting(true);
        try {
            const { data } = await api.post(`/posts/${postId}/comment`, { content: text.trim() });
            setComments(prev => [...prev, data]);
            setCount(c => (c || 0) + 1);
            setText('');
        } catch { /* ignore */ }
        finally { setPosting(false); }
    };

    return (
        <div className="border-t border-gray-800 px-4 pt-3 pb-4">
            <button onClick={toggle} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-xs transition mb-2">
                💬 <span>{count !== null ? count : '...'} comments</span>
                <span className="ml-1 text-gray-700">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div className="space-y-2">
                    {loading && <p className="text-gray-600 text-xs">Loading...</p>}
                    {comments.map(c => (
                        <div key={c.id} className="flex items-start gap-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white text-[9px] font-black flex-shrink-0">
                                {c.user?.username?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 bg-gray-800 rounded-xl px-3 py-1.5">
                                <p className="text-purple-300 text-[10px] font-bold">@{c.user?.username}</p>
                                <p className="text-gray-200 text-xs">{c.content}</p>
                            </div>
                        </div>
                    ))}
                    <form onSubmit={handleSubmit} className="flex gap-2 mt-2">
                        <input
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder="Write a comment..."
                            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                        />
                        <button type="submit" disabled={posting || !text.trim()}
                            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl disabled:opacity-40 transition">
                            Send
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}

function PostCard({ post: initialPost, isOwner, onOpen, onDelete, showComments = false }) {
    const [post, setPost] = useState(initialPost);
    const [liked, setLiked] = useState(post.isLiked);
    const [likeCount, setLikeCount] = useState(post._count?.likes || 0);
    const [showEdit, setShowEdit] = useState(false);

    const handleLike = async (e) => {
        e.stopPropagation();
        try {
            await api.post(`/posts/${post.id}/like`);
            setLiked(prev => { setLikeCount(c => c + (prev ? -1 : 1)); return !prev; });
        } catch { /* ignore */ }
    };

    const handleToggleHide = async () => {
        try {
            const { data } = await api.patch(`/posts/${post.id}/visibility`);
            setPost(prev => ({ ...prev, hidden: data.hidden }));
        } catch (err) { console.error(err); }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/posts/${post.id}`);
            onDelete(post.id);
        } catch (err) { console.error(err); }
    };

    return (
        <>
            <div
                className={`bg-gray-900 rounded-2xl border cursor-pointer transition ${post.hidden ? 'border-gray-700 opacity-60' : 'border-gray-800'}`}
                onClick={onOpen}
            >
                {post.imageUrl && (
                    <div className="overflow-hidden rounded-t-2xl">
                        <img src={post.imageUrl} alt="" className="w-full object-cover max-h-72" onError={e => e.target.style.display = 'none'} />
                    </div>
                )}
                <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-gray-200 text-sm flex-1">{post.content}</p>
                        <PostActions
                            post={post}
                            isOwner={isOwner}
                            onEdit={() => setShowEdit(true)}
                            onToggleHide={handleToggleHide}
                            onDelete={handleDelete}
                        />
                    </div>
                    {post.hidden && (
                        <p className="text-gray-600 text-xs mb-2">🙈 Hidden from branches</p>
                    )}
                    {Array.isArray(post.targets) && post.targets.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                            {post.targets.map((t, i) => {
                                const cfg = CATEGORY_CONFIG[t.category];
                                return cfg ? (
                                    <span key={i} className={`text-xs px-2 py-0.5 rounded-full bg-gradient-to-r ${cfg.color} text-white font-medium capitalize`}>
                                        {t.subCategory}
                                    </span>
                                ) : null;
                            })}
                        </div>
                    )}
                    <div className="flex items-center gap-4 text-gray-500 text-xs">
                        <button onClick={handleLike} className={`flex items-center gap-1 hover:text-red-400 transition ${liked ? 'text-red-400' : ''}`}>
                            {liked ? '❤️' : '🤍'} {likeCount}
                        </button>
                        <span className="ml-auto">{new Date(post.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    </div>
                </div>
            </div>
            {showComments && <CommentSection postId={post.id} />}
            {showEdit && <EditPostModal post={post} onClose={() => setShowEdit(false)} onSave={updated => setPost(prev => ({ ...prev, ...updated }))} />}
        </>
    );
}

// Reel card
function ReelCard({ post: initialPost, isOwner, onOpen, onDelete, showComments = false }) {
    const [post, setPost] = useState(initialPost);
    const [showEdit, setShowEdit] = useState(false);

    const handleToggleHide = async () => {
        try {
            const { data } = await api.patch(`/posts/${post.id}/visibility`);
            setPost(prev => ({ ...prev, hidden: data.hidden }));
        } catch (err) { console.error(err); }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/posts/${post.id}`);
            onDelete(post.id);
        } catch (err) { console.error(err); }
    };

    return (
        <>
            <div className={`bg-gray-900 rounded-2xl border aspect-[9/16] relative group cursor-pointer ${post.hidden ? 'border-gray-700 opacity-60' : 'border-gray-800'}`} onClick={onOpen}>
                {post.videoUrl ? (
                    <video src={post.videoUrl} className="w-full h-full object-cover" muted playsInline
                        onMouseEnter={e => e.target.play()} onMouseLeave={e => { e.target.pause(); e.target.currentTime = 0; }} />
                ) : post.imageUrl ? (
                    <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800"><span className="text-4xl">🎬</span></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition">
                    <div className="absolute bottom-3 left-3 right-3">
                        <p className="text-white text-xs line-clamp-2">{post.content}</p>
                    </div>
                </div>
                {/* Actions overlay */}
                <div className="absolute top-2 right-2 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {post.hidden && <span className="bg-black/60 text-gray-400 text-xs px-2 py-0.5 rounded-full">🙈</span>}
                    <span className="bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">🎬</span>
                    {isOwner && (
                        <PostActions
                            post={post}
                            isOwner={isOwner}
                            onEdit={() => setShowEdit(true)}
                            onToggleHide={handleToggleHide}
                            onDelete={handleDelete}
                        />
                    )}
                </div>
            </div>
            {showComments && <CommentSection postId={post.id} />}
            {showEdit && <EditPostModal post={post} onClose={() => setShowEdit(false)} onSave={updated => setPost(prev => ({ ...prev, ...updated }))} />}
        </>
    );
}

function ActivityCard({ interest, navigate, isOwn }) {
    const { t } = useTranslation();
    const cfg = CATEGORY_CONFIG[interest.category] || CATEGORY_CONFIG.SPORTS;
    const lvl = LEVEL_BADGE[interest.level] || LEVEL_BADGE.BEGINNER;
    const total = (interest.wins || 0) + (interest.losses || 0);
    const winRate = total > 0 ? Math.round((interest.wins / total) * 100) : null;

    const [showMatches, setShowMatches] = useState(false);
    const [archivedMatches, setArchivedMatches] = useState([]);
    const [loadingMatches, setLoadingMatches] = useState(false);

    // Flip state
    const [showBack, setShowBack]           = useState(false);
    const [flipping, setFlipping]           = useState(false);
    const [questions, setQuestions]         = useState([]);
    const [voteData, setVoteData]           = useState({ aggregate: {}, myVotes: {} });
    const [votingEnabled, setVotingEnabled] = useState(interest.digimonVotingEnabled || false);
    const [backLoaded, setBackLoaded]       = useState(false);
    const [myInterests, setMyInterests]     = useState(null);
    const [voting, setVoting]               = useState(false);

    const canVote = !isOwn && votingEnabled && myInterests?.some(i => i.subCategory === interest.subCategory);

    const loadBack = async () => {
        if (backLoaded) return;
        try {
            const calls = [
                api.get(`/interests/assessment/${interest.subCategory}`),
                api.get(`/interests/${interest.id}/votes`),
            ];
            if (!isOwn) calls.push(api.get('/interests/my'));
            const [qRes, vRes, mRes] = await Promise.all(calls);
            setQuestions(qRes.data.questions || []);
            setVoteData({ aggregate: vRes.data.aggregate || {}, myVotes: vRes.data.myVotes || {} });
            setVotingEnabled(vRes.data.digimonVotingEnabled);
            if (mRes) setMyInterests(mRes.data);
            setBackLoaded(true);
        } catch (err) { console.error(err); }
    };

    const handleFlip = async () => {
        if (!showBack) await loadBack();
        setFlipping(true);
        setTimeout(() => { setShowBack(v => !v); setFlipping(false); }, 150);
    };

    const handleVote = async (questionId, optionIndex) => {
        setVoting(true);
        try {
            await api.post(`/interests/${interest.id}/vote`, { questionId, optionIndex });
            const { data } = await api.get(`/interests/${interest.id}/votes`);
            setVoteData({ aggregate: data.aggregate || {}, myVotes: data.myVotes || {} });
        } catch (err) { console.error(err); }
        finally { setVoting(false); }
    };

    const handleToggleVoting = async () => {
        try {
            const { data } = await api.patch(`/interests/${interest.id}/voting`);
            setVotingEnabled(data.digimonVotingEnabled);
        } catch (err) { console.error(err); }
    };

    const handleShowMatches = async () => {
        if (showMatches) { setShowMatches(false); return; }
        setShowMatches(true);
        if (archivedMatches.length > 0) return;
        setLoadingMatches(true);
        try {
            const { data } = await api.get(`/rivals/archived?category=${interest.category}&subCategory=${interest.subCategory}`);
            setArchivedMatches(data);
        } catch (err) { console.error(err); }
        finally { setLoadingMatches(false); }
    };

    return (
        <div
            className={`${cfg.bg} border ${cfg.border} rounded-2xl overflow-hidden`}
            style={{ transform: flipping ? 'scaleX(0)' : 'scaleX(1)', transition: 'transform 0.15s ease' }}
        >
            {/* Flip toggle button */}
            <div className={`flex items-center justify-between px-4 pt-2.5 border-b ${cfg.border}`}>
                <span className={`text-[10px] font-black uppercase tracking-wider bg-gradient-to-r ${cfg.color} bg-clip-text text-transparent`}>
                    {showBack ? t('profile.stats') : t('profile.assessment')}
                </span>
                <button
                    onClick={handleFlip}
                    className="text-gray-500 hover:text-purple-400 text-base pb-2 transition"
                    title={showBack ? t('profile.stats') : t('profile.community_voting')}
                >🃏</button>
            </div>

            {!showBack ? (
                /* ── FRONT FACE — Stats ── */
                <>
                    <div className="p-4 cursor-pointer hover:opacity-90 transition"
                         onClick={() => navigate(`/category/${cfg.path}/${interest.subCategory}`)}>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className={`font-black text-base capitalize bg-gradient-to-r ${cfg.color} bg-clip-text text-transparent`}>
                                {interest.subCategory}
                            </h4>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${lvl.bg}`}>{lvl.label}</span>
                        </div>
                        <div className="flex items-end justify-between">
                            <div>
                                {interest.assessmentCompleted ? (
                                    <>
                                        <div className="flex items-baseline gap-1">
                                            <p className={`text-3xl font-black bg-gradient-to-r ${cfg.color} bg-clip-text text-transparent`}>
                                                {Number(interest.skillRating).toFixed(2)}
                                            </p>
                                            <span className="text-gray-500 text-sm font-bold">/ 5</span>
                                        </div>
                                        <p className="text-gray-500 text-xs capitalize">{interest.subCategory} · {interest.totalPoints} pts</p>
                                    </>
                                ) : (
                                    <>
                                        <p className={`text-2xl font-black bg-gradient-to-r ${cfg.color} bg-clip-text text-transparent`}>{interest.totalPoints || 0}</p>
                                        <p className="text-gray-500 text-xs capitalize">{interest.subCategory} pts</p>
                                    </>
                                )}
                            </div>
                            {total > 0 && (
                                <div className="text-right">
                                    <p className="text-gray-300 text-sm font-bold">{interest.wins}W — {interest.losses}L</p>
                                    <p className="text-gray-500 text-xs">{winRate}% win rate</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Match Records toggle */}
                    <button
                        onClick={handleShowMatches}
                        className={`w-full flex items-center justify-between px-4 py-2.5 border-t ${cfg.border} text-xs font-bold transition hover:opacity-80`}
                    >
                        <span className={`bg-gradient-to-r ${cfg.color} bg-clip-text text-transparent`}>🗃️ Match Records</span>
                        <span className="text-gray-500">{showMatches ? '▲' : '▼'}</span>
                    </button>

            {showMatches && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-800/50 pt-3">
                    {loadingMatches ? (
                        <p className="text-gray-500 text-xs text-center py-4">Loading...</p>
                    ) : archivedMatches.length === 0 ? (
                        <p className="text-gray-600 text-xs text-center py-4">No archived matches yet.</p>
                    ) : (
                        archivedMatches.map(match => {
                            const parts = Array.isArray(match.participants) ? match.participants : [];
                            const score = match.score;
                            const isWin = score?.winner === 'sender';
                            const senderName   = match.sender?.username || '?';
                            const isPlayerWanted = match.matchType === 'PLAYER_WANTED';
                            const opponentName = parts[0]?.username || 'Opponent';
                            const winnerName   = isWin ? senderName : opponentName;
                            const loserName    = isWin ? opponentName : senderName;
                            const sets = score?.sets || [];
                            const winnerSets = sets.map(s => isWin ? Number(s.sender) : Number(s.opponent));
                            const loserSets  = sets.map(s => isWin ? Number(s.opponent) : Number(s.sender));
                            const totalW = winnerSets.filter((w, i) => w > loserSets[i]).length;
                            const totalL = loserSets.filter((l, i) => l > winnerSets[i]).length;

                            return (
                                <div key={match.id} className="rounded-xl overflow-hidden border border-gray-700">
                                    {/* Date + type header */}
                                    <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/80 border-b border-gray-700">
                                        <span className="text-gray-500 text-[10px]">
                                            {isPlayerWanted
                                                ? `👥 ${match.teamSize}v${match.teamSize}`
                                                : match.matchType === 'DOUBLE' ? '2v2' : '1v1'}
                                            {match.completedAt && ` · ${new Date(match.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                                        </span>
                                        {score?.winner && (
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isWin ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {isWin ? '🏆 Win' : '❌ Loss'}
                                            </span>
                                        )}
                                        {!score && <span className="text-[10px] text-gray-600">No score</span>}
                                    </div>

                                    {isPlayerWanted ? (
                                        /* Player Wanted — show all participants */
                                        <div className="px-3 py-2 bg-gray-800/40">
                                            <p className="text-gray-400 text-xs mb-1">{senderName} (organizer)</p>
                                            <div className="flex flex-wrap gap-1">
                                                {parts.map(p => (
                                                    <span key={p.id} className="text-gray-300 text-xs bg-gray-700 rounded-full px-2 py-0.5">{p.username}</span>
                                                ))}
                                            </div>
                                        </div>
                                    ) : score && sets.length > 0 ? (
                                        <>
                                            {/* Winner row */}
                                            <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'rgba(34,197,94,0.10)' }}>
                                                <span className="text-yellow-400 text-xs flex-shrink-0">🏆</span>
                                                <span className="text-green-300 font-black text-xs flex-1 truncate">{winnerName}</span>
                                                <div className="flex gap-2 flex-shrink-0">
                                                    {winnerSets.map((w, i) => (
                                                        <span key={i} className="text-green-300 font-black text-sm w-5 text-center">{w}</span>
                                                    ))}
                                                </div>
                                                <span className="text-green-400 font-black text-base w-5 text-center flex-shrink-0">{totalW}</span>
                                            </div>
                                            {/* Set labels */}
                                            <div className="flex items-center gap-2 px-3 py-0.5 bg-gray-800/60">
                                                <span className="flex-1" />
                                                {sets.map((_, i) => (
                                                    <span key={i} className="text-gray-600 text-[9px] font-bold w-5 text-center">S{i+1}</span>
                                                ))}
                                                <span className="text-gray-600 text-[9px] font-bold w-5 text-center">T</span>
                                            </div>
                                            {/* Loser row */}
                                            <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/40">
                                                <span className="text-gray-600 text-xs flex-shrink-0 w-3" />
                                                <span className="text-gray-400 font-bold text-xs flex-1 truncate">{loserName}</span>
                                                <div className="flex gap-2 flex-shrink-0">
                                                    {loserSets.map((l, i) => (
                                                        <span key={i} className="text-gray-400 font-bold text-sm w-5 text-center">{l}</span>
                                                    ))}
                                                </div>
                                                <span className="text-gray-500 font-bold text-base w-5 text-center flex-shrink-0">{totalL}</span>
                                            </div>
                                        </>
                                    ) : (
                                        /* No score yet */
                                        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/40">
                                            <span className="text-gray-300 text-xs">{senderName}</span>
                                            <span className="text-gray-600 text-xs">vs</span>
                                            <span className="text-gray-400 text-xs">{opponentName}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
                </>
            ) : (
                /* ── BACK FACE — Community Assessment ── */
                <div className="p-4">
                    {/* Own card: voting toggle */}
                    {isOwn && (
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700/40">
                            <div>
                                <p className="text-gray-300 text-xs font-bold">{t('profile.community_voting')}</p>
                                <p className="text-gray-600 text-[10px]">{t('profile.voting_desc')}</p>
                            </div>
                            <button
                                onClick={handleToggleVoting}
                                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${votingEnabled ? 'bg-purple-600' : 'bg-gray-700'}`}
                            >
                                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${votingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    )}

                    {!isOwn && !votingEnabled ? (
                        <div className="text-center py-10">
                            <p className="text-4xl mb-2">🔒</p>
                            <p className="text-gray-500 text-sm">{t('profile.voting_locked')}</p>
                        </div>
                    ) : !backLoaded ? (
                        <p className="text-gray-500 text-sm text-center py-8">{t('common.loading')}</p>
                    ) : questions.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-8">{t('profile.no_questions')}</p>
                    ) : (
                        <div className="space-y-5 max-h-80 overflow-y-auto pr-1">
                            {!isOwn && !canVote && votingEnabled && (
                                <p className="text-amber-500/80 text-xs text-center pb-1">{t('profile.voting_need_same')}</p>
                            )}
                            {questions.map(q => {
                                const agg = voteData.aggregate[q.id] || {};
                                const totalVotes = Object.values(agg).reduce((s, v) => s + v, 0);
                                const myVoteIdx = voteData.myVotes[q.id];

                                return (
                                    <div key={q.id}>
                                        <p className="text-gray-300 text-[11px] font-bold mb-2 leading-relaxed">{q.question}</p>
                                        <div className="space-y-1.5">
                                            {q.options.map((opt, idx) => {
                                                const count = agg[idx] || 0;
                                                const pct   = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                                                const isMine = myVoteIdx === idx;

                                                return (
                                                    <button
                                                        key={idx}
                                                        disabled={!canVote || voting}
                                                        onClick={() => canVote && !voting && handleVote(q.id, idx)}
                                                        className={`w-full text-left rounded-lg overflow-hidden relative transition
                                                            ${isMine ? 'border border-purple-500/70' : 'border border-gray-700/40'}
                                                            ${canVote && !voting ? 'hover:border-purple-400/60' : ''}`}
                                                    >
                                                        {/* percentage fill bar */}
                                                        <div
                                                            className={`absolute inset-y-0 left-0 transition-all ${isMine ? 'bg-purple-600/25' : 'bg-gray-700/40'}`}
                                                            style={{ width: totalVotes > 0 ? `${pct}%` : '0%' }}
                                                        />
                                                        <div className="relative flex items-center justify-between gap-2 px-2.5 py-1.5">
                                                            <span className={`text-[11px] leading-snug ${isMine ? 'text-purple-200 font-bold' : 'text-gray-400'}`}>
                                                                {opt.text}
                                                            </span>
                                                            {totalVotes > 0 && (
                                                                <span className={`text-[10px] font-black flex-shrink-0 ${isMine ? 'text-purple-300' : 'text-gray-500'}`}>
                                                                    {pct}%
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {totalVotes > 0 && (
                                            <p className="text-gray-700 text-[10px] mt-1 pl-1">{t(totalVotes !== 1 ? 'profile.votes' : 'profile.vote', { n: totalVotes })}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ProfilePage() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const myId = useSelector(state => state.auth.user?.id);
    const isOwnProfile = !userId || userId === myId;
    const targetId = userId || myId;

    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'posts';
    const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });
    const { t } = useTranslation();

    const [profile, setProfile] = useState(null);
    const [friendship, setFriendship] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [posts, setPosts] = useState([]);
    const [reels, setReels] = useState([]);
    const [stories, setStories] = useState([]);
    const [postsLoading, setPostsLoading] = useState(false);
    const [friends, setFriends] = useState([]);
    const [friendsLoading, setFriendsLoading] = useState(false);
    const [friendsLoaded, setFriendsLoaded] = useState(false);

    const [showEditModal, setShowEditModal] = useState(false);
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [assessmentTarget, setAssessmentTarget] = useState(null); // {id, subCategory, categoryColor}
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createType, setCreateType] = useState('POST');
    const [viewingContent, setViewingContent] = useState(null);
    const [archivedStories, setArchivedStories] = useState([]);
    const [showArchive, setShowArchive] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            setIsLoading(true);
            try {
                const { data } = await api.get(isOwnProfile ? '/users/me' : `/users/${targetId}`);
                setProfile(data);
                if (!isOwnProfile) {
                    const { data: fs } = await api.get(`/friends/status/${targetId}`);
                    setFriendship(fs);
                }
            } catch (err) { console.error(err); }
            finally { setIsLoading(false); }
        };
        fetchProfile();
    }, [targetId, isOwnProfile]);

    useEffect(() => {
        if (!profile?.id) return;
        setPostsLoading(true);
        const requests = [
            api.get(`/posts/user/${profile.id}?type=POST`),
            api.get(`/posts/user/${profile.id}?type=REEL`),
            api.get(`/posts/user/${profile.id}?type=STORY`),
        ];
        if (isOwnProfile) {
            requests.push(api.get(`/posts/user/${profile.id}?type=STORY&archive=true`));
        }
        Promise.all(requests).then(([p, r, s, arch]) => {
            setPosts(p.data);
            setReels(r.data);
            setStories(s.data);
            if (arch) setArchivedStories(arch.data);
        }).catch(console.error)
          .finally(() => setPostsLoading(false));
    }, [profile?.id, isOwnProfile]);

    useEffect(() => {
        if (activeTab !== 'friends' || friendsLoaded) return;
        setFriendsLoading(true);
        api.get('/friends').then(({ data }) => {
            setFriends(data);
            setFriendsLoaded(true);
        }).catch(console.error)
          .finally(() => setFriendsLoading(false));
    }, [activeTab, friendsLoaded]);

    const handleSendRequest = async () => {
        setActionLoading(true);
        try { await api.post(`/friends/request/${targetId}`); setFriendship({ status: 'PENDING', isSender: true }); }
        catch (err) { console.error(err); }
        finally { setActionLoading(false); }
    };

    const handleRespondRequest = async (action) => {
        setActionLoading(true);
        try {
            await api.patch(`/friends/request/${friendship.friendshipId}`, { action });
            setFriendship(prev => ({ ...prev, status: action === 'accept' ? 'ACCEPTED' : 'REJECTED' }));
        } catch (err) { console.error(err); }
        finally { setActionLoading(false); }
    };

    const handleUnfriend = async () => {
        setActionLoading(true);
        try { await api.delete(`/friends/unfriend/${targetId}`); setFriendship({ status: null }); }
        catch (err) { console.error(err); }
        finally { setActionLoading(false); }
    };

    const handlePostCreated = (newPost) => {
        if (newPost.type === 'POST') setPosts(prev => [newPost, ...prev]);
        else if (newPost.type === 'REEL') setReels(prev => [newPost, ...prev]);
        else if (newPost.type === 'STORY') setStories(prev => [newPost, ...prev]);
    };

    const openCreate = (type) => { setCreateType(type); setShowCreateModal(true); };

    const [editingStory, setEditingStory] = useState(null);

    const handleDeleteStory = async (storyId) => {
        try {
            await api.delete(`/posts/${storyId}`);
            setStories(prev => prev.filter(s => s.id !== storyId));
        } catch (err) { console.error(err); }
    };

    const renderFriendButton = () => {
        if (!friendship) return null;
        const { status, isSender } = friendship;
        if (status === 'ACCEPTED') return (
            <div className="flex gap-2">
                <button onClick={() => navigate(`/messages/${targetId}`)} className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold px-4 py-2.5 rounded-xl text-sm hover:opacity-90 transition">💬 Message</button>
                <button onClick={handleUnfriend} disabled={actionLoading} className="bg-gray-700 text-gray-300 hover:bg-red-600/20 hover:text-red-400 font-bold px-4 py-2.5 rounded-xl text-sm border border-gray-600 hover:border-red-500 transition">Unfriend</button>
            </div>
        );
        if (status === 'PENDING' && isSender) return (
            <button disabled className="w-full bg-gray-700 text-gray-400 font-bold py-2.5 rounded-xl text-sm border border-gray-600 cursor-not-allowed">⏳ Request Sent</button>
        );
        if (status === 'PENDING' && !isSender) return (
            <div className="flex gap-2">
                <button onClick={() => handleRespondRequest('accept')} disabled={actionLoading} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold py-2.5 rounded-xl text-sm hover:opacity-90 transition">✓ Accept</button>
                <button onClick={() => handleRespondRequest('reject')} disabled={actionLoading} className="flex-1 bg-gray-700 text-gray-300 font-bold py-2.5 rounded-xl text-sm border border-gray-600 hover:bg-gray-600 transition">✕ Reject</button>
            </div>
        );
        return (
            <button onClick={handleSendRequest} disabled={actionLoading} className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50">
                + Add Friend
            </button>
        );
    };

    const SPORT_EMOJI = {
        tennis: '🎾', football: '⚽', basketball: '🏀', volleyball: '🏐',
        swimming: '🏊', running: '🏃', cycling: '🚴', boxing: '🥊', padel: '🏓',
        martial_arts: '🥋', yoga: '🧘', music: '🎵', painting: '🎨', dance: '💃',
        photography: '📸', theater: '🎭', writing: '✍️', fps: '🎯', rpg: '⚔️',
        strategy: '♟️', moba: '🏆', battle_royale: '💥',
    };

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} />

            <div className="w-full px-4 py-6">
                {isLoading ? (
                    <p className="text-gray-400 text-center py-16">Loading...</p>
                ) : !profile ? (
                    <p className="text-gray-400 text-center py-16">User not found.</p>
                ) : profile.isPrivate ? (
                    <div className="text-center py-16 bg-gray-900 rounded-2xl border border-gray-800 max-w-md mx-auto">
                        <Avatar user={profile} size="xl" />
                        <h2 className="text-white font-bold text-2xl mt-4">{profile.fullName || profile.username}</h2>
                        <p className="text-gray-400 mt-1">@{profile.username}</p>
                        <p className="text-gray-500 mt-4">🔒 This account is private.</p>
                        <div className="mt-6 max-w-xs mx-auto">{renderFriendButton()}</div>
                    </div>
                ) : (
                    <div className="flex gap-4 items-start">

                        {/* ── LEFT SIDEBAR ── */}
                        <div className="w-72 shrink-0 space-y-4">

                            {/* Profile Card */}
                            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
                                <div className="flex flex-col items-center text-center mb-4">
                                    <div className="relative inline-block">
                                        <Avatar user={profile} size="xl" />
                                        {isOwnProfile && (
                                            <button
                                                onClick={() => openCreate('STORY')}
                                                className="absolute -top-1 -right-1 w-6 h-6 bg-purple-500 hover:bg-purple-400 rounded-full flex items-center justify-center text-white font-black text-sm border-2 border-gray-900 transition z-10"
                                                title="Add Story"
                                            >+</button>
                                        )}
                                        {isOwnProfile && (
                                            <button
                                                onClick={() => setShowArchive(v => !v)}
                                                className={`absolute -bottom-1 -left-1 w-6 h-6 rounded-full flex items-center justify-center text-white font-black text-sm border-2 border-gray-900 transition z-10 ${showArchive ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                                                title="Story Archive"
                                            >−</button>
                                        )}
                                    </div>
                                    <h2 className="text-white font-black text-xl mt-3">{profile.fullName || profile.username}</h2>
                                    <p className="text-gray-400 text-sm">@{profile.username}</p>
                                    <div className="mt-3 w-full space-y-1">
                                        {/* Posts */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => { setActiveTab('posts'); setShowArchive(false); }}
                                                className={`flex-1 rounded-lg py-1.5 px-3 flex items-center justify-between transition ${activeTab === 'posts' && !showArchive ? 'bg-purple-600/30 border border-purple-500/50' : 'bg-gray-800 border border-transparent hover:bg-gray-700'}`}
                                            >
                                                <span className="text-gray-400 text-xs font-bold">✍️ {t('profile.posts')}</span>
                                                <span className="text-white text-xs font-black">{posts.length}</span>
                                            </button>
                                            {isOwnProfile && (
                                                <button onClick={() => openCreate('POST')} className="w-7 h-7 bg-purple-600 hover:bg-purple-500 rounded-lg flex items-center justify-center text-white font-black text-sm transition flex-shrink-0" title={t('profile.new_post')}>+</button>
                                            )}
                                        </div>

                                        {/* Reels */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => { setActiveTab('reels'); setShowArchive(false); }}
                                                className={`flex-1 rounded-lg py-1.5 px-3 flex items-center justify-between transition ${activeTab === 'reels' && !showArchive ? 'bg-purple-600/30 border border-purple-500/50' : 'bg-gray-800 border border-transparent hover:bg-gray-700'}`}
                                            >
                                                <span className="text-gray-400 text-xs font-bold">🎬 {t('profile.reels')}</span>
                                                <span className="text-white text-xs font-black">{reels.length}</span>
                                            </button>
                                            {isOwnProfile && (
                                                <button onClick={() => openCreate('REEL')} className="w-7 h-7 bg-purple-600 hover:bg-purple-500 rounded-lg flex items-center justify-center text-white font-black text-sm transition flex-shrink-0" title={t('profile.new_reel')}>+</button>
                                            )}
                                        </div>

                                        {/* Friends */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => { setActiveTab('friends'); setShowArchive(false); }}
                                                className={`flex-1 rounded-lg py-1.5 px-3 flex items-center justify-between transition ${activeTab === 'friends' && !showArchive ? 'bg-purple-600/30 border border-purple-500/50' : 'bg-gray-800 border border-transparent hover:bg-gray-700'}`}
                                            >
                                                <span className="text-gray-400 text-xs font-bold">👫 {t('profile.friends')}</span>
                                                <span className="text-white text-xs font-black">{profile.friendCount || 0}</span>
                                            </button>
                                            {isOwnProfile && (
                                                <button onClick={() => navigate('/messages')} className="w-7 h-7 bg-purple-600 hover:bg-purple-500 rounded-lg flex items-center justify-center text-white font-black text-sm transition flex-shrink-0" title={t('profile.find_friends')}>+</button>
                                            )}
                                        </div>

                                        {/* Activities */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => { setActiveTab('activities'); setShowArchive(false); }}
                                                className={`flex-1 rounded-lg py-1.5 px-3 flex items-center justify-between transition ${activeTab === 'activities' && !showArchive ? 'bg-purple-600/30 border border-purple-500/50' : 'bg-gray-800 border border-transparent hover:bg-gray-700'}`}
                                            >
                                                <span className="text-gray-400 text-xs font-bold">🏃 {t('profile.activities')}</span>
                                                <span className="text-white text-xs font-black">{profile.interests?.length || 0}</span>
                                            </button>
                                            {isOwnProfile && (
                                                <button onClick={() => setShowActivityModal(true)} className="w-7 h-7 bg-purple-600 hover:bg-purple-500 rounded-lg flex items-center justify-center text-white font-black text-sm transition flex-shrink-0" title={t('profile.add_activity')}>+</button>
                                            )}
                                        </div>
                                    </div>

                                    {profile.gender && (
                                        <p className="text-gray-400 text-xs mt-2">
                                            {profile.gender === 'MALE' ? `♂️ ${t('profile.male')}` : profile.gender === 'FEMALE' ? `♀️ ${t('profile.female')}` : `⚧️ ${t('profile.other')}`}
                                        </p>
                                    )}
                                    {profile.bio && <p className="text-gray-300 text-xs mt-2 leading-relaxed">{profile.bio}</p>}
                                    <p className="text-gray-600 text-[10px] mt-2">
                                        {t('profile.member_since', { date: new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) })}
                                    </p>
                                </div>

                                {/* Action button */}
                                {isOwnProfile ? (
                                    <button onClick={() => setShowEditModal(true)}
                                        className="w-full bg-gray-800 text-gray-300 hover:text-white font-bold py-2 rounded-xl text-sm border border-gray-700 hover:border-gray-500 transition">
                                        ✏️ {t('profile.edit')}
                                    </button>
                                ) : (
                                    <div>{renderFriendButton()}</div>
                                )}
                            </div>

                            {/* Activity Points */}

                        </div>

                        {/* ── CENTER — Posts/Reels ── */}
                        <div className="flex-1 min-w-0 space-y-4">

                            {/* Stories Strip */}
                            {(isOwnProfile || stories.length > 0) && !showArchive && (
                                <StoriesStrip
                                    stories={stories}
                                    isOwnProfile={isOwnProfile}
                                    onAddStory={() => openCreate('STORY')}
                                    onStoryClick={setViewingContent}
                                    onEditStory={setEditingStory}
                                    onDeleteStory={handleDeleteStory}
                                />
                            )}

                            {/* Archive */}
                            {showArchive && (
                                <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
                                    <h3 className="text-white font-bold mb-4">🗃️ {t('profile.story_archive')}</h3>
                                    {archivedStories.length === 0 ? (
                                        <p className="text-gray-500 text-sm text-center py-6">{t('profile.no_stories')}</p>
                                    ) : (
                                        <div className="grid grid-cols-3 gap-3">
                                            {archivedStories.map(story => (
                                                <div key={story.id} onClick={() => setViewingContent(story)}
                                                    className="relative rounded-2xl overflow-hidden aspect-[9/16] bg-gray-800 cursor-pointer group">
                                                    {story.imageUrl
                                                        ? <img src={story.imageUrl} alt="" className="w-full h-full object-cover" />
                                                        : <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm p-2 text-center">{story.content}</div>}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition">
                                                        <p className="absolute bottom-2 left-2 right-2 text-white text-xs line-clamp-2">{story.content}</p>
                                                    </div>
                                                    <span className="absolute top-2 left-2 bg-black/60 text-gray-400 text-[9px] px-1.5 py-0.5 rounded-full">
                                                        {new Date(story.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Friends */}
                            {!showArchive && activeTab === 'friends' && (
                                <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
                                    <h3 className="text-white font-bold mb-4">👫 {t('profile.friends')} ({profile.friendCount || 0})</h3>
                                    {friendsLoading ? (
                                        <p className="text-gray-500 text-center py-10 text-sm">{t('common.loading')}</p>
                                    ) : friends.length === 0 ? (
                                        <div className="text-center py-12">
                                            <p className="text-4xl mb-3">👥</p>
                                            <p className="text-gray-500 text-sm">{t('profile.no_friends')}</p>
                                            {isOwnProfile && <button onClick={() => navigate('/messages')} className="mt-3 text-purple-400 hover:text-purple-300 text-sm transition">+ {t('profile.find_friends')}</button>}
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3">
                                            {friends.map(f => (
                                                <button key={f.id} onClick={() => navigate(`/profile/${f.id}`)}
                                                    className="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 rounded-xl p-3 transition text-left w-full">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                                                        {f.username?.[0]?.toUpperCase() || '?'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-white font-bold text-sm truncate">{f.fullName || f.username}</p>
                                                        <p className="text-gray-500 text-xs truncate">@{f.username}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Activities */}
                            {!showArchive && activeTab === 'activities' && (
                                <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-white font-bold">🎯 {t('profile.activities')}</h3>
                                        {isOwnProfile && (
                                            <button onClick={() => setShowActivityModal(true)} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold px-3 py-1 rounded-lg text-xs hover:opacity-90 transition">{t('profile.manage')}</button>
                                        )}
                                    </div>
                                    {!profile.interests?.length ? (
                                        <div className="text-center py-12">
                                            <p className="text-4xl mb-3">🏃</p>
                                            <p className="text-gray-500 text-sm">{t('profile.no_activities')}</p>
                                            {isOwnProfile && <button onClick={() => setShowActivityModal(true)} className="mt-3 text-purple-400 hover:text-purple-300 text-sm transition">+ {t('profile.add_activity')}</button>}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {profile.interests.map(interest => (
                                                <ActivityCard key={interest.id} interest={interest} navigate={navigate} isOwn={isOwnProfile} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Media Posts / Reels */}
                            {postsLoading ? (
                                <p className="text-gray-500 text-center py-10 text-sm">{t('common.loading')}</p>
                            ) : showArchive ? null : activeTab === 'posts' ? (() => {
                                const mediaPosts = posts.filter(p => p.imageUrl || p.videoUrl);
                                return mediaPosts.length === 0 ? (
                                    <div className="text-center py-12 bg-gray-900 rounded-2xl border border-gray-800">
                                        <p className="text-4xl mb-3">📷</p>
                                        <p className="text-gray-500 text-sm">{t('profile.no_posts')}</p>
                                        {isOwnProfile && <button onClick={() => openCreate('POST')} className="mt-3 text-purple-400 hover:text-purple-300 text-sm transition">{t('profile.share_photo')}</button>}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {mediaPosts.map(post => (
                                            <PostCard key={post.id} post={post} isOwner={isOwnProfile}
                                                onOpen={() => setViewingContent(post)}
                                                onDelete={id => setPosts(prev => prev.filter(p => p.id !== id))}
                                                showComments />
                                        ))}
                                    </div>
                                );
                            })() : activeTab === 'reels' ? (() => {
                                return reels.length === 0 ? (
                                    <div className="text-center py-12 bg-gray-900 rounded-2xl border border-gray-800">
                                        <p className="text-4xl mb-3">🎬</p>
                                        <p className="text-gray-500 text-sm">{t('profile.no_reels')}</p>
                                        {isOwnProfile && <button onClick={() => openCreate('REEL')} className="mt-3 text-purple-400 hover:text-purple-300 text-sm transition">{t('profile.share_reel')}</button>}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {reels.map(reel => (
                                            <ReelCard key={reel.id} post={reel} isOwner={isOwnProfile}
                                                onOpen={() => setViewingContent(reel)}
                                                onDelete={id => setReels(prev => prev.filter(r => r.id !== id))}
                                                showComments />
                                        ))}
                                    </div>
                                );
                            })() : null}
                        </div>


                    </div>
                )}
            </div>

            {showEditModal && (
                <EditProfileModal user={profile} onClose={() => setShowEditModal(false)}
                    onSave={(updated) => { setProfile(prev => ({ ...prev, ...updated })); setShowEditModal(false); }} />
            )}
            {showActivityModal && (
                <AddActivityModal currentInterests={profile?.interests || []} onClose={() => setShowActivityModal(false)}
                    onAdd={newInterest => {
                        setProfile(prev => ({ ...prev, interests: [...(prev.interests || []), newInterest] }));
                        // Trigger assessment for the newly added activity
                        const cfg = CATEGORY_CONFIG[newInterest.category] || CATEGORY_CONFIG.SPORTS;
                        setAssessmentTarget({
                            id: newInterest.id,
                            subCategory: newInterest.subCategory,
                            categoryColor: cfg.color,
                        });
                        setShowActivityModal(false);
                    }}
                    onRemove={removedId => setProfile(prev => ({ ...prev, interests: prev.interests.filter(i => i.id !== removedId) }))} />
            )}
            {showCreateModal && (
                <CreatePostModal
                    type={createType}
                    interests={profile?.interests || []}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={handlePostCreated}
                />
            )}
            {editingStory && (
                <EditPostModal
                    post={editingStory}
                    onClose={() => setEditingStory(null)}
                    onSave={updated => {
                        setStories(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
                        setEditingStory(null);
                    }}
                />
            )}
            {viewingContent && (
                <ContentViewer post={viewingContent} onClose={() => setViewingContent(null)} />
            )}
            {assessmentTarget && (
                <AssessmentModal
                    interestId={assessmentTarget.id}
                    subCategory={assessmentTarget.subCategory}
                    categoryColor={assessmentTarget.categoryColor}
                    onClose={() => setAssessmentTarget(null)}
                    onComplete={(result) => {
                        setProfile(prev => ({
                            ...prev,
                            interests: prev.interests.map(i =>
                                i.id === assessmentTarget.id
                                    ? { ...i, level: result.level, skillRating: result.skillRating, totalPoints: result.totalPoints }
                                    : i
                            ),
                        }));
                        setAssessmentTarget(null);
                    }}
                />
            )}
        </div>
    );
}

export default ProfilePage;
