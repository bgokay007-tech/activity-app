import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

const INPUT = 'w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500';
const BTN = 'w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-50 mt-5';

export default function ForgotPasswordPage() {
    const { t } = useTranslation();
    const a = (k, o) => t(`auth.${k}`, o);
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const sendCode = async (e) => {
        e?.preventDefault();
        if (!email.trim()) { setError(a('fillAll')); return; }
        setLoading(true); setError('');
        try {
            await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
            setInfo(a('fpCodeSent', { email: email.trim() }));
            setStep(2);
        } catch (err) {
            setError(err?.response?.data?.message || a('error'));
        } finally { setLoading(false); }
    };

    const verifyCode = (e) => {
        e.preventDefault();
        if (!code.trim()) { setError(a('fillAll')); return; }
        setError('');
        setStep(3);
    };

    const resetPassword = async (e) => {
        e.preventDefault();
        if (!newPassword || !confirmPassword) { setError(a('fillAll')); return; }
        if (newPassword !== confirmPassword) { setError(a('fpPassMismatch')); return; }
        setLoading(true); setError('');
        try {
            await api.post('/auth/reset-password', { email: email.trim().toLowerCase(), code: code.trim(), newPassword });
            alert(a('fpSuccess'));
            navigate('/login');
        } catch (err) {
            setError(err?.response?.data?.message || a('error'));
        } finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-5xl font-black tracking-tight">
                        {'AcTiViTy'.split('').map((ch, i) => (
                            <span key={i} className="logo-letter" style={{ animationDelay: `${-(7 - i) * 0.3}s` }}>{ch}</span>
                        ))}
                    </h1>
                    <p className="text-gray-400 mt-2">{a('fpTitle')}</p>
                </div>

                <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
                    <div className="flex justify-center gap-2 mb-6">
                        {[1, 2, 3].map(n => (
                            <div key={n} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold ${step >= n ? 'border-purple-500 bg-purple-500/15 text-purple-400' : 'border-gray-700 text-gray-500'}`}>{n}</div>
                        ))}
                    </div>

                    {error && <div className="bg-red-500/10 border border-red-500 text-red-400 rounded-lg p-3 mb-4 text-sm">{error}</div>}

                    {step === 1 && (
                        <form onSubmit={sendCode}>
                            <label className="text-gray-400 text-sm mb-1 block">{a('otpMethodLabel')}</label>
                            <div className="flex gap-2 mb-4">
                                <div className="flex-1 py-2 rounded-xl border border-purple-500 bg-purple-500/15 text-purple-300 text-center text-sm font-bold">{a('viaEmail')}</div>
                                <div className="flex-1 py-2 rounded-xl border border-gray-700 bg-gray-800 text-gray-400 text-center text-sm font-bold opacity-40">
                                    {a('viaPhone')}
                                    <span className="block text-[10px]">{a('comingSoon')}</span>
                                </div>
                            </div>
                            <label className="text-gray-400 text-sm mb-1 block">{a('fpEmailLabel')}</label>
                            <input type="email" className={INPUT} value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" autoComplete="email" />
                            <button type="submit" className={BTN} disabled={loading}>{loading ? '…' : a('fpSendCode')}</button>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={verifyCode}>
                            {info && <p className="text-gray-500 text-xs text-center mb-2">{info}</p>}
                            <label className="text-gray-400 text-sm mb-1 block">{a('fpCodeLabel')}</label>
                            <input className={`${INPUT} text-2xl font-black text-center tracking-[0.6em]`} value={code}
                                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={a('fpCodePh')} inputMode="numeric" autoComplete="one-time-code" />
                            <button type="submit" className={BTN}>{a('fpVerify')}</button>
                            <button type="button" onClick={sendCode} disabled={loading} className="w-full text-purple-400 font-bold text-sm mt-4">{a('fpResend')}</button>
                        </form>
                    )}

                    {step === 3 && (
                        <form onSubmit={resetPassword}>
                            <label className="text-gray-400 text-sm mb-1 block">{a('fpNewPass')}</label>
                            <input type="password" className={INPUT} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={a('fpNewPassPh')} autoComplete="new-password" />
                            <label className="text-gray-400 text-sm mb-1 mt-3 block">{a('fpConfirmPass')}</label>
                            <input type="password" className={INPUT} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
                            <button type="submit" className={BTN} disabled={loading}>{loading ? '…' : a('fpReset')}</button>
                        </form>
                    )}

                    <p className="text-center mt-6">
                        <Link to="/login" className="text-gray-400 hover:text-gray-300 text-sm">{a('fpBackToLogin')}</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
