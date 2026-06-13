import { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import api from '../services/api';

const CATEGORY_COLOR = {
    SPORTS: 'from-green-500 to-emerald-500',
    ARTS:   'from-pink-500 to-rose-500',
    GAMES:  'from-blue-500 to-indigo-500',
};

const ACCEPT      = { POST: 'image/*', STORY: 'image/*,video/*', REEL: 'video/*' };
const TYPE_LABEL  = { POST: 'Post', STORY: 'Story', REEL: 'Reel' };
const TYPE_ICON   = { POST: '✍️',  STORY: '📸',    REEL: '🎬'  };

// Canvas helper — crops the image and returns a Blob
function getCroppedBlob(image, crop, mimeType = 'image/jpeg') {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth  / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width  = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
        image,
        crop.x * scaleX, crop.y * scaleY,
        crop.width * scaleX, crop.height * scaleY,
        0, 0, crop.width, crop.height,
    );
    return new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.92));
}

// ── Crop step ──────────────────────────────────────────────────────────────
function CropStep({ localUrl, mimeType, onApply, onCancel }) {
    const imgRef = useRef(null);
    const [crop, setCrop]         = useState(null);
    const [completedCrop, setCompletedCrop] = useState(null);
    const [aspect, setAspect]     = useState(undefined); // free / 1 / 4/5 / 16/9

    const ASPECTS = [
        { label: 'Free',  value: undefined },
        { label: '1:1',   value: 1         },
        { label: '4:5',   value: 4/5       },
        { label: '16:9',  value: 16/9      },
    ];

    const onImageLoad = useCallback((e) => {
        const { width, height } = e.currentTarget;
        const initial = centerCrop(
            makeAspectCrop({ unit: '%', width: 90 }, aspect || width / height, width, height),
            width, height,
        );
        setCrop(initial);
    }, [aspect]);

    const handleApply = async () => {
        if (!completedCrop || !imgRef.current) {
            onApply(null); // no crop — use original
            return;
        }
        const blob = await getCroppedBlob(imgRef.current, completedCrop, mimeType);
        onApply(blob);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Aspect ratio buttons */}
            <div className="flex gap-2 mb-3 flex-shrink-0">
                {ASPECTS.map(a => (
                    <button
                        key={a.label}
                        onClick={() => {
                            setAspect(a.value);
                            if (imgRef.current) {
                                const { width, height } = imgRef.current;
                                const next = centerCrop(
                                    makeAspectCrop({ unit: '%', width: 90 }, a.value || width / height, width, height),
                                    width, height,
                                );
                                setCrop(next);
                            }
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
                            aspect === a.value
                                ? 'bg-purple-600 border-purple-500 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                    >
                        {a.label}
                    </button>
                ))}
            </div>

            {/* Crop canvas */}
            <div className="flex-1 flex items-center justify-center overflow-hidden rounded-xl bg-black/40 min-h-0">
                <ReactCrop
                    crop={crop}
                    onChange={c => setCrop(c)}
                    onComplete={c => setCompletedCrop(c)}
                    aspect={aspect}
                    className="max-h-full"
                >
                    <img
                        ref={imgRef}
                        src={localUrl}
                        onLoad={onImageLoad}
                        className="max-h-72 max-w-full object-contain"
                        alt="crop"
                    />
                </ReactCrop>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-3 flex-shrink-0">
                <button onClick={onCancel} className="flex-1 bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl border border-gray-700 hover:bg-gray-700 transition text-sm">
                    Cancel
                </button>
                <button onClick={handleApply} className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl hover:opacity-90 transition text-sm">
                    Apply Crop ✓
                </button>
            </div>
        </div>
    );
}


const CAT_CONFIG = {
    SPORTS: { label: '🏃 Sports', color: 'from-green-500 to-emerald-500', bg: 'bg-green-500/10', border: 'border-green-500/30' },
    ARTS:   { label: '🎨 Arts',   color: 'from-pink-500 to-rose-500',     bg: 'bg-pink-500/10',  border: 'border-pink-500/30'  },
    GAMES:  { label: '🎮 Games',  color: 'from-blue-500 to-indigo-500',   bg: 'bg-blue-500/10',  border: 'border-blue-500/30'  },
};

// ── Main modal ─────────────────────────────────────────────────────────────
export default function CreatePostModal({ type, interests, onClose, onCreated, initialTargets = [] }) {
    const [step, setStep]               = useState('compose');
    const [localUrl, setLocalUrl]       = useState(null);
    const [localMime, setLocalMime]     = useState('image/jpeg');
    const [content, setContent]         = useState('');
    const [mediaFile, setMediaFile]     = useState(null);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [selectedTargets, setSelectedTargets] = useState(initialTargets);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isPosting, setIsPosting]     = useState(false);
    const [aiResult, setAiResult]       = useState(null);
    const [allCategories, setAllCategories] = useState([]);
    const [activeCatTab, setActiveCatTab]   = useState(initialTargets[0]?.category || 'SPORTS');
    const [musicName, setMusicName] = useState('');
    const [musicUrl, setMusicUrl]   = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
        api.get('/interests/categories').then(({ data }) => {
            setAllCategories(data.categories || []);
        });
    }, []);

    const isVideo   = type === 'REEL';
    const canPost   = (content.trim() || mediaFile) && selectedTargets.length > 0;
    const canAnalyze = content.trim() || mediaFile;

const toggleTarget = (category, subCategory) => {
        const key = `${category}__${subCategory}`;
        setSelectedTargets(prev => {
            const exists = prev.find(t => `${t.category}__${t.subCategory}` === key);
            return exists
                ? prev.filter(t => `${t.category}__${t.subCategory}` !== key)
                : [...prev, { category, subCategory }];
        });
        setAiResult(null);
    };

    // File chosen → for images go to crop, for videos upload directly
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type.startsWith('image/')) {
            // Show crop step first
            const reader = new FileReader();
            reader.onload = () => {
                setLocalUrl(reader.result);
                setLocalMime(file.type);
                setStep('crop');
            };
            reader.readAsDataURL(file);
        } else {
            // Video — upload directly
            uploadFile(file, null);
        }
    };

    // Upload to backend (blob for cropped image, file for video)
    const uploadFile = async (file, blob) => {
        setUploadProgress(0);
        const formData = new FormData();
        if (blob) {
            const ext = file?.type === 'image/png' ? '.png' : '.jpg';
            formData.append('file', blob, `cropped${ext}`);
        } else {
            formData.append('file', file);
        }
        try {
            const { data } = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (ev) => {
                    if (ev.total) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
                },
            });
            setMediaFile({ url: data.url, fileType: data.type, name: file?.name || 'image' });
        } catch (err) {
            console.error(err);
        } finally {
            setUploadProgress(null);
        }
    };

    const handleCropApply = (blob) => {
        setStep('compose');
        // Re-read original file ref for metadata
        const origFile = fileInputRef.current?.files[0];
        uploadFile(origFile, blob || null);
    };

    const handleCropCancel = () => {
        setStep('compose');
        setLocalUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleAnalyze = async () => {
        if (!canAnalyze) return;
        setIsAnalyzing(true);
        setAiResult(null);
        try {
            const { data } = await api.post('/posts/analyze', {
                content,
                imageUrl: mediaFile?.fileType === 'image' ? mediaFile.url : undefined,
                videoUrl: mediaFile?.fileType === 'video' ? mediaFile.url : undefined,
                userInterests: interests,
            });
            setAiResult(data);
            if (data.suggestedBranches?.length > 0) setSelectedTargets(data.suggestedBranches);
        } catch {
            setAiResult({ warning: 'AI analysis unavailable. Select branches manually.', suggestedBranches: [], relevanceNote: '' });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handlePost = async () => {
        if (!canPost) return;
        setIsPosting(true);
        try {
            const { data } = await api.post('/posts', {
                type,
                content,
                imageUrl: mediaFile?.fileType === 'image' ? mediaFile.url : undefined,
                videoUrl: mediaFile?.fileType === 'video' ? mediaFile.url : undefined,
                targets: selectedTargets,
                category: selectedTargets[0]?.category,
                subCategory: selectedTargets[0]?.subCategory,
musicUrl: musicUrl || undefined,
                musicName: musicName || undefined,
            });
            onCreated(data);
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setIsPosting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg max-h-[92vh] flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800 flex-shrink-0">
                    <h3 className="text-white font-bold text-lg">
                        {step === 'crop' ? '✂️ Crop Image' : `${TYPE_ICON[type]} New ${TYPE_LABEL[type]}`}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                {/* ── Crop step ── */}
                {step === 'crop' && localUrl && (
                    <div className="flex-1 flex flex-col px-6 py-4 min-h-0">
                        <CropStep
                            localUrl={localUrl}
                            mimeType={localMime}
                            onApply={handleCropApply}
                            onCancel={handleCropCancel}
                        />
                    </div>
                )}

                {/* ── Compose step ── */}
                {step === 'compose' && (
                    <>
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                            {/* Upload area */}
                            <div>
                                {!mediaFile && uploadProgress === null ? (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full border-2 border-dashed border-gray-700 hover:border-purple-500/60 rounded-2xl p-8 flex flex-col items-center gap-3 transition group"
                                    >
                                        <span className="text-4xl group-hover:scale-110 transition">
                                            {isVideo ? '🎬' : type === 'STORY' ? '📸' : '🖼️'}
                                        </span>
                                        <div className="text-center">
                                            <p className="text-white font-bold text-sm">
                                                Upload {isVideo ? 'Video' : type === 'STORY' ? 'Photo or Video' : 'Photo'}
                                            </p>
                                            <p className="text-gray-500 text-xs mt-1">
                                                {isVideo ? 'MP4, WebM' : type === 'STORY' ? 'JPG, PNG, MP4' : 'JPG, PNG, GIF, WebP'} · max 50 MB
                                            </p>
                                        </div>
                                        <span className="bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold text-sm px-5 py-2 rounded-xl">
                                            Choose file
                                        </span>
                                    </button>
                                ) : uploadProgress !== null ? (
                                    <div className="border-2 border-dashed border-purple-500/40 rounded-2xl p-8 flex flex-col items-center gap-3">
                                        <div className="w-12 h-12 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" />
                                        <p className="text-gray-400 text-sm">{uploadProgress}% uploading...</p>
                                    </div>
                                ) : (
                                    <div className="relative rounded-2xl overflow-hidden border border-gray-700">
                                        {mediaFile.fileType === 'video' ? (
                                            <video src={mediaFile.url} controls className="w-full max-h-56 object-cover bg-black" />
                                        ) : (
                                            <img src={mediaFile.url} alt="preview" className="w-full max-h-56 object-cover" />
                                        )}
                                        <div className="absolute top-2 right-2 flex gap-2">
                                            {mediaFile.fileType === 'image' && (
                                                <button
                                                    onClick={() => {
                                                        // Re-open crop with the uploaded URL
                                                        setLocalUrl(mediaFile.url);
                                                        setLocalMime('image/jpeg');
                                                        setStep('crop');
                                                    }}
                                                    className="bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-purple-700/80 transition"
                                                >
                                                    ✂️ Crop
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    setMediaFile(null);
                                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                                }}
                                                className="bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm hover:bg-red-600/80 transition"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <input ref={fileInputRef} type="file" accept={ACCEPT[type]} onChange={handleFileSelect} className="hidden" />
                            </div>

                            {/* Caption */}
                            <textarea
                                value={content}
                                onChange={e => { setContent(e.target.value); setAiResult(null); }}
                                placeholder={type === 'POST' ? "What's on your mind? 💬" : type === 'STORY' ? "Add a caption..." : "Describe your reel..."}
                                rows={3}
                                className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500 resize-none text-sm"
                            />

                            {/* Music — only for media posts */}
                            {mediaFile && (
                                <div className="space-y-2">
                                    <p className="text-gray-400 text-xs flex items-center gap-1">🎵 Add music <span className="text-gray-700">(optional)</span></p>
                                    <div className="flex gap-2">
                                        <input
                                            value={musicName}
                                            onChange={e => setMusicName(e.target.value)}
                                            placeholder="Song name / artist"
                                            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                                        />
                                    </div>
                                    <input
                                        value={musicUrl}
                                        onChange={e => setMusicUrl(e.target.value)}
                                        placeholder="Music URL (YouTube, Spotify, SoundCloud...)"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                                    />
                                    {musicUrl && (
                                        <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2 border border-purple-500/30">
                                            <span className="text-lg">🎵</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-xs font-bold truncate">{musicName || 'Music Track'}</p>
                                                <p className="text-gray-500 text-[10px] truncate">{musicUrl}</p>
                                            </div>
                                            <button onClick={() => { setMusicName(''); setMusicUrl(''); }} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* AI analyze */}
                            {canAnalyze && (
                                <button onClick={handleAnalyze} disabled={isAnalyzing}
                                    className="w-full flex items-center justify-center gap-2 bg-purple-600/10 border border-purple-500/30 text-purple-300 font-bold py-2.5 rounded-xl text-sm hover:border-purple-400 transition disabled:opacity-50">
                                    {isAnalyzing
                                        ? <><span className="animate-spin inline-block">⚙️</span> Analyzing...</>
                                        : <>✨ Auto-detect branches with AI</>}
                                </button>
                            )}

                            {/* AI result */}
                            {aiResult && (
                                <div className={`rounded-xl p-3 border text-sm ${aiResult.warning ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
                                    {aiResult.warning
                                        ? <p className="text-yellow-300 font-medium">⚠️ {aiResult.warning}</p>
                                        : <p className="text-green-300 font-medium">✓ Branches auto-selected</p>}
                                    {aiResult.relevanceNote && <p className="text-gray-400 text-xs mt-1">{aiResult.relevanceNote}</p>}
                                </div>
                            )}

                            {/* Branch selector — all categories */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-gray-400 text-xs">Share to branches</p>
                                    {selectedTargets.length > 0 && (
                                        <p className="text-purple-400 text-xs font-bold">{selectedTargets.length} selected</p>
                                    )}
                                </div>

                                {/* Category tabs */}
                                <div className="flex gap-1.5 mb-2">
                                    {Object.entries(CAT_CONFIG).map(([id, cfg]) => (
                                        <button key={id} onClick={() => setActiveCatTab(id)}
                                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${activeCatTab === id ? `bg-gradient-to-r ${cfg.color} text-white` : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                                            {cfg.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Subcategory grid */}
                                <div className="max-h-44 overflow-y-auto pr-1">
                                    {allCategories.length === 0 ? (
                                        <p className="text-gray-600 text-xs text-center py-4">Loading...</p>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {(allCategories.find(c => c.id === activeCatTab)?.subCategories || []).map(sub => {
                                                const selected = !!selectedTargets.find(t => t.category === activeCatTab && t.subCategory === sub.id);
                                                const cfg = CAT_CONFIG[activeCatTab];
                                                return (
                                                    <button key={sub.id} onClick={() => toggleTarget(activeCatTab, sub.id)}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition ${selected ? `bg-gradient-to-r ${cfg.color} text-white border-transparent` : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                                                        <span className="text-base flex-shrink-0">{sub.emoji}</span>
                                                        <span className="truncate text-xs font-medium">{sub.name}</span>
                                                        {selected && <span className="ml-auto text-xs flex-shrink-0">✓</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Selected chips */}
                                {selectedTargets.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {selectedTargets.map((t, i) => {
                                            const cfg = CAT_CONFIG[t.category];
                                            return (
                                                <span key={i} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gradient-to-r ${cfg?.color || 'from-purple-500 to-blue-500'} text-white font-medium`}>
                                                    {t.subCategory}
                                                    <button onClick={() => toggleTarget(t.category, t.subCategory)} className="hover:opacity-70 leading-none">×</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-800 flex gap-3 flex-shrink-0">
                            <button onClick={onClose} className="flex-1 bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl border border-gray-700 hover:bg-gray-700 transition text-sm">Cancel</button>
                            <button onClick={handlePost} disabled={isPosting || !canPost}
                                className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-40 hover:opacity-90 transition text-sm">
                                {isPosting ? 'Sharing...' : selectedTargets.length > 1 ? `Share to ${selectedTargets.length} branches` : 'Share'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
