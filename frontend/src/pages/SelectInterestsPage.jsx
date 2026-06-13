import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const ENABLED_SUBS = new Set(['tennis', 'padel', 'volleyball']);

function SelectInterestsPage() {
    const navigate = useNavigate();
    const [categories, setCategories] = useState([]);
    const [selectedInterests, setSelectedInterests] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeCategory, setActiveCategory] = useState(null);

    useEffect(() => {
        api.get('/interests/categories').then(({ data }) => {
            setCategories(data.categories);
            setActiveCategory(data.categories[0]?.id);
            setIsLoading(false);
        });
    }, []);

    const toggleInterest = (categoryId, subId) => {
        const key = `${categoryId}:${subId}`;
        setSelectedInterests(prev =>
            prev.includes(key) ? prev.filter(i => i !== key) : [...prev, key]
        );
    };

    const isSelected = (categoryId, subId) =>
        selectedInterests.includes(`${categoryId}:${subId}`);

    const handleSave = async () => {
        if (selectedInterests.length === 0) {
            alert('Please select at least one interest!');
            return;
        }
        setIsSaving(true);
        try {
            await Promise.all(
                selectedInterests.map(key => {
                    const [category, subCategory] = key.split(':');
                    return api.post('/interests/add', { category, subCategory });
                })
            );
            navigate('/home');
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const categoryColors = {
        SPORTS: 'from-green-600 to-emerald-500',
        ARTS: 'from-pink-600 to-rose-500',
        GAMES: 'from-blue-600 to-indigo-500',
    };

    const activeCategoryData = categories.find(c => c.id === activeCategory);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <p className="text-white text-xl">Loading...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 p-4">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8 pt-8">
                    <h1 className="text-5xl font-black text-white tracking-tight mb-2">
                        Ac<span className="text-purple-500">Ti</span>Vi<span className="text-purple-500">Ty</span>
                    </h1>
                    <h2 className="text-2xl font-bold text-white mt-4">What are you into?</h2>
                    <p className="text-gray-400 mt-2">Select your interests to personalize your experience</p>
                </div>

                {/* Kategori Tabs */}
                <div className="flex gap-3 mb-6">
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={`flex-1 py-3 rounded-xl font-bold text-sm transition ${activeCategory === cat.id
                                ? `bg-gradient-to-r ${categoryColors[cat.id]} text-white`
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                        >
                            {cat.emoji} {cat.name}
                        </button>
                    ))}
                </div>

                {/* Kategori Açıklama */}
                {activeCategoryData && (
                    <p className="text-gray-400 text-sm mb-4 text-center">
                        {activeCategoryData.description}
                    </p>
                )}

                {/* Alt Kategoriler */}
                {activeCategoryData && (
                    <div className="grid grid-cols-2 gap-3 mb-8">
                        {activeCategoryData.subCategories.map(sub => {
                            const enabled = ENABLED_SUBS.has(sub.id);
                            return (
                                <button
                                    key={sub.id}
                                    onClick={() => enabled && toggleInterest(activeCategory, sub.id)}
                                    disabled={!enabled}
                                    className={`p-4 rounded-xl border-2 transition flex items-center gap-3 ${!enabled
                                        ? 'border-gray-800 bg-gray-800/30 text-gray-600 opacity-50 cursor-not-allowed'
                                        : isSelected(activeCategory, sub.id)
                                            ? 'border-purple-500 bg-purple-500/20 text-white'
                                            : 'border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-500'
                                        }`}
                                >
                                    <span className="text-2xl">{sub.emoji}</span>
                                    <span className="font-semibold">{sub.name}</span>
                                    {!enabled
                                        ? <span className="ml-auto text-gray-600 text-xs">🔧</span>
                                        : isSelected(activeCategory, sub.id) && <span className="ml-auto text-purple-400">✓</span>
                                    }
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Seçilenler */}
                {selectedInterests.length > 0 && (
                    <div className="bg-gray-900 rounded-xl p-4 mb-6 border border-gray-800">
                        <p className="text-gray-400 text-sm mb-2">Selected ({selectedInterests.length}):</p>
                        <div className="flex flex-wrap gap-2">
                            {selectedInterests.map(key => {
                                const [catId, subId] = key.split(':');
                                const cat = categories.find(c => c.id === catId);
                                const sub = cat?.subCategories.find(s => s.id === subId);
                                return (
                                    <span
                                        key={key}
                                        className="bg-purple-500/20 text-purple-300 text-xs px-3 py-1 rounded-full border border-purple-500/30"
                                    >
                                        {sub?.emoji} {sub?.name}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Devam Et */}
                <button
                    onClick={handleSave}
                    disabled={isSaving || selectedInterests.length === 0}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl transition disabled:opacity-50 text-lg"
                >
                    {isSaving ? 'Saving...' : `Continue with ${selectedInterests.length} interests →`}
                </button>

                <button
                    onClick={() => navigate('/home')}
                    className="w-full text-gray-500 hover:text-gray-300 py-3 mt-2 transition text-sm"
                >
                    Skip for now
                </button>
            </div>
        </div>
    );
}

export default SelectInterestsPage;