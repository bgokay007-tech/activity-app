import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { setCredentials } from '../store/slices/authSlice';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import LanguageSwitcher from '../components/LanguageSwitcher';

function LoginPage() {
    const { t } = useTranslation();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            const { data } = await api.post('/auth/login', formData);
            dispatch(setCredentials(data));
            navigate('/home');
        } catch (err) {
            setError(err.response?.data?.message || t('auth.loginFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-5xl font-black tracking-tight">
                        {'AcTiViTy'.split('').map((ch, i) => (
                            <span key={i} className="logo-letter" style={{ animationDelay: `${-(7 - i) * 0.3}s` }}>{ch}</span>
                        ))}
                    </h1>
                    <p className="text-gray-400 mt-2">{t('auth.findYourMatch')}</p>
                    <div className="mt-4"><LanguageSwitcher inline /></div>
                </div>

                <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
                    <h2 className="text-2xl font-bold text-white mb-6">{t('auth.signIn')}</h2>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500 text-red-400 rounded-lg p-3 mb-4">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="text-gray-400 text-sm mb-1 block">{t('auth.email')}</label>
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
                            <label className="text-gray-400 text-sm mb-1 block">{t('auth.password')}</label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500"
                                placeholder="••••••••"
                                required
                            />
                            <div className="text-right mt-2">
                                <Link to="/forgot-password" className="text-purple-400 hover:text-purple-300 text-sm font-semibold">
                                    {t('auth.forgotPassword')}
                                </Link>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-50"
                        >
                            {isLoading ? '…' : t('auth.signIn')}
                        </button>
                    </form>

                    <p className="text-gray-400 text-center mt-6">
                        {t('auth.noAccount')}{' '}
                        <Link to="/register" className="text-purple-400 hover:text-purple-300 font-semibold">
                            {t('auth.signUp')}
                        </Link>
                    </p>
                    <p className="text-gray-400 text-center text-sm mt-3">
                        🏢 {t('auth.bizNoAccount')}{' '}
                        <Link to="/register/business" className="text-amber-400 hover:text-amber-300 font-semibold">
                            {t('auth.bizCreateLink')}
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;