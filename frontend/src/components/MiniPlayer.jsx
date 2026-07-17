import {
    useActiveTrack, useIsPlaying, useProgress,
    togglePlayPause, skipNext, skipPrevious, seekTo,
} from '../services/musicPlayer';

function fmt(sec) {
    if (!sec || Number.isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

export default function MiniPlayer() {
    const track = useActiveTrack();
    const isPlaying = useIsPlaying();
    const { position, duration } = useProgress();

    if (!track) return null;

    const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900 border-t border-gray-800 px-4 py-2">
            <div
                className="h-1 bg-gray-700 rounded-full mb-2 cursor-pointer"
                onClick={(e) => {
                    if (!duration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / rect.width;
                    seekTo(Math.max(0, Math.min(duration, ratio * duration)));
                }}
            >
                <div className="h-1 bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center gap-3 max-w-5xl mx-auto">
                {track.artwork
                    ? <img src={track.artwork} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    : <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-lg flex-shrink-0">🎵</div>
                }
                <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-bold truncate">{track.title}</p>
                    <p className="text-gray-500 text-xs truncate">{track.artist}</p>
                </div>
                <span className="text-gray-500 text-xs hidden sm:block flex-shrink-0">{fmt(position)} / {fmt(duration)}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={skipPrevious} className="text-gray-400 hover:text-white text-lg px-1">⏮</button>
                    <button onClick={() => togglePlayPause(isPlaying)}
                        className="w-8 h-8 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center transition">
                        {isPlaying ? '⏸' : '▶'}
                    </button>
                    <button onClick={skipNext} className="text-gray-400 hover:text-white text-lg px-1">⏭</button>
                </div>
            </div>
        </div>
    );
}
