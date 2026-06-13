import { useNavigate } from 'react-router-dom';

export default function ContentViewer({ post, onClose }) {
    const navigate = useNavigate();
    if (!post) return null;

    const isVideo = !!post.videoUrl;
    const hasMedia = post.imageUrl || post.videoUrl;

    return (
        <div
            className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="relative bg-gray-900 rounded-2xl border border-gray-800 max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
                    <button
                        onClick={() => { onClose(); navigate(`/profile/${post.user?.id}`); }}
                        className="flex items-center gap-2 hover:opacity-80 transition"
                    >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-bold">
                            {post.user?.username?.[0]?.toUpperCase()}
                        </div>
                        <div>
                            <p className="text-white text-sm font-bold">{post.user?.fullName || post.user?.username}</p>
                            <p className="text-gray-500 text-xs">@{post.user?.username}</p>
                        </div>
                    </button>
                    <button
                        onClick={onClose}
                        className="ml-auto text-gray-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center"
                    >
                        ✕
                    </button>
                </div>

                {/* Media */}
                {hasMedia && (
                    <div className="flex-shrink-0 bg-black flex items-center justify-center">
                        {isVideo ? (
                            <video
                                src={post.videoUrl}
                                controls
                                autoPlay
                                className="max-h-[55vh] w-full object-contain"
                            />
                        ) : (
                            <img
                                src={post.imageUrl}
                                alt=""
                                className="max-h-[55vh] w-full object-contain"
                            />
                        )}
                    </div>
                )}

                {/* Content */}
                {post.content && (
                    <div className="px-4 py-3 flex-shrink-0">
                        <p className="text-gray-200 text-sm">{post.content}</p>
                    </div>
                )}

                {/* Branch tags + date */}
                <div className="px-4 pb-3 flex items-center justify-between flex-shrink-0">
                    <div className="flex flex-wrap gap-1">
                        {Array.isArray(post.targets) && post.targets.map((t, i) => (
                            <span key={i} className="text-xs bg-purple-600/20 text-purple-300 px-2 py-0.5 rounded-full capitalize">
                                {t.subCategory}
                            </span>
                        ))}
                    </div>
                    <p className="text-gray-600 text-xs">
                        {new Date(post.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                </div>
            </div>
        </div>
    );
}
