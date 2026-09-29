import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setCredentials } from '../store/slices/authSlice';
import api from '../services/api';
import CityAutocomplete from '../components/CityAutocomplete';

const PASSWORD_TESTS = [
    { id: 'len',     key: 'passRuleLen',     test: p => p.length >= 8 && p.length <= 16 },
    { id: 'upper',   key: 'passRuleUpper',   test: p => /[A-Z]/.test(p) },
    { id: 'lower',   key: 'passRuleLower',   test: p => /[a-z]/.test(p) },
    { id: 'special', key: 'passRuleSpecial', test: p => /[^a-zA-Z0-9]/.test(p) },
];

const DIAL_CODES = [
    ['🇹🇷', '+90'], ['🇺🇸', '+1'], ['🇬🇧', '+44'], ['🇩🇪', '+49'], ['🇫🇷', '+33'], ['🇮🇹', '+39'],
    ['🇪🇸', '+34'], ['🇳🇱', '+31'], ['🇧🇪', '+32'], ['🇵🇱', '+48'], ['🇵🇹', '+351'], ['🇸🇪', '+46'],
    ['🇨🇭', '+41'], ['🇦🇹', '+43'], ['🇳🇴', '+47'], ['🇬🇷', '+30'], ['🇷🇺', '+7'], ['🇸🇦', '+966'],
    ['🇯🇵', '+81'], ['🇦🇺', '+61'],
];

const genCaptcha = () => {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    return { q: `${a} + ${b}`, ans: String(a + b) };
};

const INPUT = 'w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-amber-500';
const LABEL = 'text-gray-400 text-sm mb-1 mt-3 block';
const BTN = 'w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition disabled:opacity-50';

export default function BusinessRegisterPage() {
    const { t } = useTranslation();
    const a = (k, o) => t(`auth.${k}`, o);
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const [form, setForm] = useState({
        fullName: '', businessName: '', taxNumber: '', username: '', email: '',
        workPhone: '', mobilePhone: '', city: '', businessAddress: '', password: '', gender: '',
    });
    const [workDial, setWorkDial] = useState('+90');
    const [mobileDial, setMobileDial] = useState('+90');
    const [showPass, setShowPass] = useState(false);
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [timer, setTimer] = useState(0);
    const [loading, setLoading] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const [captcha, setCaptcha] = useState(genCaptcha);
    const [captchaInput, setCaptchaInput] = useState('');
    const [captchaOk, setCaptchaOk] = useState(false);
    const [captchaErr, setCaptchaErr] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const timerRef = useRef(null);

    useEffect(() => () => clearInterval(timerRef.current), []);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const passwordValid = PASSWORD_TESTS.every(r => r.test(form.password));
    const fullWorkPhone = form.workPhone.trim() ? workDial + form.workPhone.trim() : '';
    const fullMobilePhone = form.mobilePhone.trim() ? mobileDial + form.mobilePhone.trim() : '';

    const verifyCaptcha = () => {
        if (captchaInput.trim() === captcha.ans) { setCaptchaOk(true); setCaptchaErr(false); }
        else { setCaptchaErr(true); setCaptchaOk(false); setCaptcha(genCaptcha()); setCaptchaInput(''); }
    };

    const startTimer = () => {
        setTimer(60);
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimer(prev => { if (prev <= 1) { clearInterval(timerRef.current); return 0; } return prev - 1; });
        }, 1000);
    };

    const fail = (msg) => { setError(msg); window.scrollTo({ top: 0, behavior: 'smooth' }); };

    const handleSendOtp = async () => {
        if (!form.fullName.trim()) return fail(a('bizMissingFullName'));
        if (!form.businessName.trim()) return fail(a('bizMissingBizName'));
        if (!form.taxNumber.trim()) return fail(a('bizMissingTaxNo'));
        if (!form.username.trim()) return fail(a('bizMissingUsername'));
        if (!form.email.trim()) return fail(a('bizMissingEmail'));
        if (!form.gender) return fail(a('gender'));
        if (!passwordValid) return fail(a('passwordRules'));
        if (!agreed) return fail(a('bizMissingAgree'));
        if (!captchaOk) return fail(a('bizMissingCaptcha'));
        setLoading(true); setError('');
        try {
            const res = await api.post('/auth/send-otp', {
                method: 'email', value: form.email.trim(), username: form.username.trim(), email: form.email.trim(),
            });
            setOtpSent(true);
            startTimer();
            if (res.data.devCode) setInfo(`Dev: ${res.data.devCode}`);
        } catch (e) {
            fail(e?.response?.data?.message || a('otpSendFailed'));
        } finally { setLoading(false); }
    };

    const handleVerify = async () => {
        if (otp.length !== 6) return setError(a('otpSixDigits'));
        setLoading(true); setError('');
        try {
            await api.post('/auth/verify-otp', { method: 'email', value: form.email.trim(), code: otp });
            const { data } = await api.post('/auth/register', {
                username: form.username.trim(),
                password: form.password,
                fullName: form.fullName.trim(),
                email: form.email.trim(),
                phone: fullMobilePhone || fullWorkPhone || undefined,
                city: form.city || undefined,
                gender: form.gender || undefined,
                isBusiness: true,
                businessName: form.businessName.trim(),
                taxNumber: form.taxNumber.trim(),
                businessAddress: form.businessAddress.trim() || undefined,
            });
            dispatch(setCredentials({ user: data.user, token: data.token }));
            navigate('/business');
        } catch (e) {
            setError(e?.response?.data?.message || a('bizRegisterFailed'));
        } finally { setLoading(false); }
    };

    const phoneRow = (dial, setDial, key) => (
        <div className="flex gap-2">
            <select value={dial} onChange={e => setDial(e.target.value)} aria-label={a('dialCodeLabel')}
                className="bg-gray-800 text-white rounded-xl px-2 border border-gray-700 focus:outline-none focus:border-amber-500">
                {DIAL_CODES.map(([flag, code]) => <option key={flag + code} value={code}>{flag} {code}</option>)}
            </select>
            <input className={INPUT} value={form[key]} onChange={e => set(key, e.target.value.replace(/\D/g, ''))} placeholder={a('phonePh')} inputMode="tel" />
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-lg py-8">
                <div className="text-center mb-6">
                    <h1 className="text-5xl font-black tracking-tight">
                        {'AcTiViTy'.split('').map((ch, i) => (
                            <span key={i} className="logo-letter" style={{ animationDelay: `${-(7 - i) * 0.3}s` }}>{ch}</span>
                        ))}
                    </h1>
                    <p className="text-white font-bold mt-2">{a('bizRegTitle')}</p>
                    <p className="text-gray-500 text-sm">{a('bizRegHint')}</p>
                </div>

                <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                    {error && <div className="bg-red-500/10 border border-red-500 text-red-400 rounded-lg p-3 mb-2 text-sm">{error}</div>}
                    {info && <div className="bg-amber-500/10 border border-amber-500 text-amber-300 rounded-lg p-3 mb-2 text-sm">{info}</div>}

                    <label className={LABEL}>{a('bizAuthFullName')}</label>
                    <input className={INPUT} value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder={a('bizAuthFullNamePh')} autoComplete="name" />

                    <label className={LABEL}>{a('gender')}</label>
                    <div className="flex gap-2">
                        {[['MALE', a('male')], ['FEMALE', a('female')], ['OTHER', a('otherGender')]].map(([val, lbl]) => (
                            <button type="button" key={val} onClick={() => set('gender', val)}
                                className={`flex-1 py-2.5 rounded-xl border text-sm font-bold transition ${form.gender === val ? 'border-amber-500 bg-amber-500/15 text-amber-300' : 'border-gray-700 bg-gray-800 text-gray-400'}`}>{lbl}</button>
                        ))}
                    </div>

                    <label className={LABEL}>{a('bizNameLabel')}</label>
                    <input className={INPUT} value={form.businessName} onChange={e => set('businessName', e.target.value)} placeholder={a('bizNamePh')} />

                    <label className={LABEL}>{a('bizTaxLabel')}</label>
                    <input className={INPUT} value={form.taxNumber} onChange={e => set('taxNumber', e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder={a('bizTaxPh')} inputMode="numeric" />

                    <label className={LABEL}>{a('bizUsernameLabel')}</label>
                    <input className={INPUT} value={form.username} onChange={e => set('username', e.target.value)} placeholder={a('bizUsernamePh')} autoCapitalize="none" autoComplete="username" />

                    <label className={LABEL}>{a('bizEmailLabel')}</label>
                    <input type="email" className={INPUT} value={form.email} onChange={e => set('email', e.target.value)} placeholder={a('bizEmailPh')} autoComplete="email" />

                    <label className={LABEL}>{a('bizWorkPhoneLabel')}</label>
                    {phoneRow(workDial, setWorkDial, 'workPhone')}

                    <label className={LABEL}>{a('bizMobilePhoneLabel')}</label>
                    {phoneRow(mobileDial, setMobileDial, 'mobilePhone')}

                    <label className={LABEL}>{a('bizCityLabel')}</label>
                    <CityAutocomplete value={form.city} onChange={v => set('city', v)} placeholder={a('selectCity')} className={INPUT} />

                    <label className={LABEL}>{a('bizAddressLabel')}</label>
                    <textarea className={`${INPUT} min-h-18`} value={form.businessAddress} onChange={e => set('businessAddress', e.target.value)} placeholder={a('bizAddressPh')} />

                    <label className={LABEL}>{a('bizPasswordLabel')}</label>
                    <div className="flex">
                        <input type={showPass ? 'text' : 'password'} className={`${INPUT} rounded-r-none`} value={form.password}
                            onChange={e => set('password', e.target.value.slice(0, 16))} placeholder="••••••••" maxLength={16} autoComplete="new-password" />
                        <button type="button" onClick={() => setShowPass(p => !p)} className="px-3 bg-gray-800 border border-l-0 border-gray-700 rounded-r-xl">{showPass ? '🙈' : '👁️'}</button>
                    </div>
                    {form.password.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                            {PASSWORD_TESTS.map(r => (
                                <p key={r.id} className={`text-xs font-bold ${r.test(form.password) ? 'text-green-400' : 'text-red-400'}`}>
                                    {r.test(form.password) ? '✓' : '✗'} {a(r.key)}
                                </p>
                            ))}
                        </div>
                    )}

                    <div className="border-t border-gray-800 my-4" />

                    <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1 accent-amber-500" />
                        <span className="text-gray-300 text-sm">{a('bizAgreeLabel')}</span>
                    </label>

                    <div className={`flex items-center justify-between gap-3 mt-4 border rounded-xl p-3 ${captchaOk ? 'border-green-400' : captchaErr ? 'border-red-400' : 'border-gray-700'}`}>
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{captchaOk ? '✅' : '🤖'}</span>
                            <div>
                                <p className="text-white font-bold text-xs">{a('bizNotRobot')}</p>
                                {captchaOk
                                    ? <p className="text-green-400 font-bold text-sm">{a('bizVerified')}</p>
                                    : <p className={`font-black text-lg ${captchaErr ? 'text-red-400' : 'text-amber-500'}`}>{captcha.q} = ?</p>}
                                {captchaErr && <p className="text-red-400 text-[10px]">{a('bizCaptchaWrong')}</p>}
                            </div>
                        </div>
                        {!captchaOk && (
                            <div className="flex gap-2">
                                <input className="w-14 bg-gray-800 text-white rounded-xl border border-gray-700 text-center text-lg font-black" value={captchaInput}
                                    onChange={e => { setCaptchaInput(e.target.value.replace(/\D/g, '').slice(0, 2)); setCaptchaErr(false); }} placeholder="?" inputMode="numeric" />
                                <button type="button" onClick={verifyCaptcha} disabled={!captchaInput} className="bg-amber-500 text-white font-bold text-xs px-3 rounded-xl disabled:opacity-40">{a('doVerify')}</button>
                            </div>
                        )}
                    </div>

                    <button type="button" className={`${BTN} mt-5`} onClick={handleSendOtp} disabled={loading || otpSent || !passwordValid || !agreed}>
                        {loading && !otpSent ? '…' : otpSent ? a('bizCodeSentLabel') : a('bizSendCode')}
                    </button>

                    {otpSent && (
                        <div className="mt-5 bg-gray-950 border border-gray-800 rounded-xl p-4">
                            <p className="text-gray-400 text-sm text-center">{a('bizCodeSentTo', { email: form.email })}</p>
                            <label className={LABEL}>{a('bizOtpLabel')}</label>
                            <input className={`${INPUT} text-3xl font-black text-center tracking-[0.5em]`} value={otp}
                                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="••••••" autoFocus autoComplete="one-time-code" />
                            <button type="button" className={`${BTN} mt-3`} onClick={handleVerify} disabled={loading}>{loading ? '…' : a('bizCreateBtn')}</button>
                            <button type="button" disabled={timer > 0 || loading} onClick={() => { setOtpSent(false); setTimeout(handleSendOtp, 100); }}
                                className="w-full text-purple-400 font-bold text-sm mt-3 disabled:opacity-40">
                                {timer > 0 ? a('resendTimer', { s: timer }) : a('resendCode')}
                            </button>
                        </div>
                    )}

                    <p className="text-gray-400 text-center text-sm mt-6">
                        {a('bizHaveAccount')} <Link to="/login" className="text-amber-400 font-semibold">{t('auth.login_link')}</Link>
                    </p>
                    <p className="text-gray-500 text-center text-xs mt-1">
                        {a('bizIndividualReg')}<Link to="/register" className="text-purple-400 font-semibold">{a('bizIndividualRegLink')}</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
