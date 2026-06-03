import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { setCredentials } from '../store/slices/authSlice';
import api from '../services/api';

function RegisterPage() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        email: '',
        username: '',
        password: '',
        fullName: '',
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            const { data } = await api.post('/auth/register', formData);
            dispatch(setCredentials(data));
            navigate('/select-interests');
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-5xl font-black text-white tracking-tight">
                        Ac<span className="text-purple-500">Ti</span>Vi<span className="text-purple-500">Ty</span>
                    </h1>
                    <p className="text-gray-400 mt-2">Join the community</p>
                </div>

                <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
                    <h2 className="text-2xl font-bold text-white mb-6">Create account</h2>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500 text-red-400 rounded-lg p-3 mb-4">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="text-gray-400 text-sm mb-1 block">Full Name</label>
                            <input
                                type="text"
                                value={formData.fullName}
                                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500"
                                placeholder="John Doe"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-gray-400 text-sm mb-1 block">Username</label>
                            <input
                                type="text"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500"
                                placeholder="johndoe"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-gray-400 text-sm mb-1 block">Email</label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500"
                                placeholder="your@email.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-gray-400 text-sm mb-1 block">Password</label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-50"
                        >
                            {isLoading ? 'Creating account...' : 'Sign Up'}
                        </button>
                    </form>

                    <p className="text-gray-400 text-center mt-6">
                        Already have an account?{' '}
                        <Link to="/login" className="text-purple-400 hover:text-purple-300 font-semibold">
                            Log in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default RegisterPage;