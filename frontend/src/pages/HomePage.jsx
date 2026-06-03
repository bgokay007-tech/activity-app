import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { logout } from '../store/slices/authSlice';

function HomePage() {
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const categories = [
        {
            id: 'SPORTS',
            name: 'Sports',
            emoji: '🏃',
            description: 'Find athletes, join tournaments, challenge rivals',
            color: 'from-green-600 to-emerald-500',
            bg: 'bg-green-500/10',
            border: 'border-green-500/30',
            hover: 'hover:border-green-500',
        },
        {
            id: 'ARTS',
            name: 'Arts',
            emoji: '🎨',
            description: 'Connect with artists, share your work, collaborate',
            color: 'from-pink-600 to-rose-500',
            bg: 'bg-pink-500/10',
            border: 'border-pink-500/30',
            hover: 'hover:border-pink-500',
        },
        {
            id: 'GAMES',
            name: 'Games',
            emoji: '🎮',
            description: 'Find teammates, join tournaments, compete online',
            color: 'from-blue-600 to-indigo-500',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/30',
            hover: 'hover:border-blue-500',
        },
    ];

    return (
        <div className="min-h-screen bg-gray-950">
            {/* Navbar */}
            <nav className="bg-gray-900 border-b border-gray-800 px-6 py-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <h1 className="text-2xl font-black text-white">
                        Ac<span className="text-purple-500">Ti</span>Vi<span className="text-purple-500">Ty</span>
                    </h1>
                    <button
                        onClick={() => dispatch(logout())}
                        className="text-gray-400 hover:text-white text-sm transition"
                    >
                        Logout
                    </button>
                </div>
            </nav>

            {/* Content */}
            <div className="max-w-4xl mx-auto px-6 py-12">
                <div className="text-center mb-12">
                    <h2 className="text-4xl font-bold text-white mb-3">
                        What do you want to do today?
                    </h2>
                    <p className="text-gray-400 text-lg">
                        Choose a category to explore activities, find people and join events
                    </p>
                </div>

                {/* Kategori Kartları */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => navigate(`/category/${cat.id.toLowerCase()}`)}
                            className={`${cat.bg} ${cat.border} ${cat.hover} border-2 rounded-2xl p-8 text-left transition-all duration-200 hover:scale-105 hover:shadow-2xl`}
                        >
                            <span className="text-6xl block mb-4">{cat.emoji}</span>
                            <h3 className={`text-2xl font-bold bg-gradient-to-r ${cat.color} bg-clip-text text-transparent mb-2`}>
                                {cat.name}
                            </h3>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                {cat.description}
                            </p>
                            <div className={`mt-6 inline-flex items-center gap-2 bg-gradient-to-r ${cat.color} text-white text-sm font-bold px-4 py-2 rounded-full`}>
                                Explore {cat.name} →
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default HomePage;