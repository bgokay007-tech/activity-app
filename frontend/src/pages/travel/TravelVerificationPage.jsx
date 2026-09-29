import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import Navbar from '../../components/Navbar';
import { INPUT, LABEL, PRIMARY_BTN, uploadFile } from './travelShared';

const pad2 = (n) => String(n).padStart(2, '0');

function parseBirth(text) {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text.trim());
    if (!m) return null;
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return d.getUTCDate() === +m[1] ? d : null;
}

function DocRow({ label, value, uploading, disabled, accept, pickLabel, doneLabel, onFile }) {
    const ref = useRef(null);
    return (
        <div className="flex items-center justify-between gap-3 mt-4">
            <span className="text-gray-400 text-sm font-bold flex-1">{label}</span>
            <input ref={ref} type="file" accept={accept} hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
            <button type="button" disabled={disabled} onClick={() => ref.current?.click()}
                className={`min-w-28 border rounded-xl px-3 py-2 text-sm font-bold ${value ? 'border-green-500 text-green-500' : 'border-sky-500 text-sky-400'}`}>
                {uploading ? '…' : value ? doneLabel : pickLabel}
            </button>
        </div>
    );
}

export default function TravelVerificationPage() {
    const { t } = useTranslation();
    const tv = (k, o) => t(`travel.${k}`, o);
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [current, setCurrent] = useState(null);
    const [fullName, setFullName] = useState('');
    const [tcNo, setTcNo] = useState('');
    const [birth, setBirth] = useState('');
    const [phone, setPhone] = useState('');
    const [idCardUrl, setIdCardUrl] = useState(null);
    const [adliSicilUrl, setAdliSicilUrl] = useState(null);
    const [selfieUrl, setSelfieUrl] = useState(null);
    const [uploadingKey, setUploadingKey] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get('/travel/verification').then(({ data }) => {
            setCurrent(data || null);
            if (!data) return;
            setFullName(data.fullName || '');
            setTcNo(data.tcKimlikNo || '');
            const bd = data.birthDate ? new Date(data.birthDate) : null;
            if (bd) setBirth(`${pad2(bd.getUTCDate())}.${pad2(bd.getUTCMonth() + 1)}.${bd.getUTCFullYear()}`);
            setPhone(data.phone || '');
            setIdCardUrl(data.idCardUrl || null);
            setAdliSicilUrl(data.adliSicilUrl || null);
            setSelfieUrl(data.selfieUrl || null);
        }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const upload = async (key, file, setter) => {
        if (uploadingKey) return;
        setUploadingKey(key);
        try {
            const res = await uploadFile(file);
            if (res?.url) setter(res.url);
        } catch (e) {
            alert(e?.response?.data?.message || tv('actionFailed'));
        } finally { setUploadingKey(null); }
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!fullName.trim() || !tcNo.trim() || !phone.trim() || !idCardUrl || !adliSicilUrl) {
            alert(tv('tvVerifyMissing'));
            return;
        }
        const bd = parseBirth(birth);
        if (!bd) { alert(tv('tvInvalidBirth')); return; }
        setSaving(true);
        try {
            await api.post('/travel/verification', {
                fullName, tcKimlikNo: tcNo, birthDate: bd.toISOString(), phone,
                idCardUrl, adliSicilUrl, selfieUrl,
            });
            alert(tv('tvVerifySubmitted'));
            navigate(-1);
        } catch (err) {
            alert(err?.response?.data?.message || tv('actionFailed'));
        } finally { setSaving(false); }
    };

    const status = current?.status;
    const statusText = status === 'APPROVED' ? tv('tvVerifyApproved')
        : status === 'PENDING' ? tv('tvVerifyPending')
        : status === 'REJECTED' ? (current.adminNote ? tv('tvVerifyRejected', { note: current.adminNote }) : tv('tvVerifyRejected_plain'))
        : null;
    const statusCls = status === 'APPROVED' ? 'text-green-400 bg-green-500/10' : status === 'REJECTED' ? 'text-red-400 bg-red-500/10' : 'text-amber-400 bg-amber-500/10';

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} title={tv('tvTitle')} />
            {loading ? <p className="text-gray-500 text-center py-16">…</p> : (
                <form onSubmit={submit} className="max-w-xl mx-auto px-4 py-6 pb-24">
                    <h2 className="text-white text-xl font-black text-center mb-3">{tv('tvVerifyTitle')}</h2>
                    {statusText && <p className={`rounded-xl p-3 text-sm font-bold mb-2 ${statusCls}`}>{statusText}</p>}
                    <p className="text-gray-400 text-sm leading-relaxed">🛡️ {tv('tvVerifyIntro')}</p>

                    <label className={LABEL}>{tv('tvFullName')} *</label>
                    <input className={INPUT} value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" />

                    <label className={LABEL}>{tv('tvIdNo')} *</label>
                    <input className={INPUT} value={tcNo} onChange={e => setTcNo(e.target.value.replace(/\D/g, '').slice(0, 11))} inputMode="numeric" placeholder="12345678901" />

                    <label className={LABEL}>{tv('tvBirthDate')} *</label>
                    <input className={INPUT} value={birth} onChange={e => setBirth(e.target.value)} placeholder={tv('tvBirthDatePh')} maxLength={10} />

                    <label className={LABEL}>{tv('tvPhone')} *</label>
                    <input className={INPUT} value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="+90 5xx xxx xx xx" autoComplete="tel" />

                    <DocRow label={`${tv('tvIdCard')} *`} value={idCardUrl} uploading={uploadingKey === 'id'} disabled={!!uploadingKey}
                        accept="image/*" pickLabel={tv('tvPickPhoto')} doneLabel={tv('tvUploaded')} onFile={f => upload('id', f, setIdCardUrl)} />
                    <DocRow label={`${tv('tvCriminalRecord')} *`} value={adliSicilUrl} uploading={uploadingKey === 'sicil'} disabled={!!uploadingKey}
                        accept="image/*,application/pdf" pickLabel={tv('tvPickFile')} doneLabel={tv('tvUploaded')} onFile={f => upload('sicil', f, setAdliSicilUrl)} />
                    <DocRow label={tv('tvSelfie')} value={selfieUrl} uploading={uploadingKey === 'selfie'} disabled={!!uploadingKey}
                        accept="image/*" pickLabel={tv('tvPickPhoto')} doneLabel={tv('tvUploaded')} onFile={f => upload('selfie', f, setSelfieUrl)} />

                    <button type="submit" className={`${PRIMARY_BTN} mt-6`} disabled={saving || !!uploadingKey}>{saving ? '…' : tv('tvSubmitVerify')}</button>
                </form>
            )}
        </div>
    );
}
