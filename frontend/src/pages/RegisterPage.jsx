import { useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { setCredentials } from '../store/slices/authSlice';
import api from '../services/api';

const PASSWORD_RULES = [
    { id: 'len',     label: '8-16 karakter',        test: p => p.length >= 8 && p.length <= 16 },
    { id: 'upper',   label: 'Büyük harf (A-Z)',      test: p => /[A-Z]/.test(p) },
    { id: 'lower',   label: 'Küçük harf (a-z)',      test: p => /[a-z]/.test(p) },
    { id: 'special', label: 'Özel karakter (!@#…)',  test: p => /[^a-zA-Z0-9]/.test(p) },
];

const COUNTRIES = [
    'Türkiye','Almanya','Amerika Birleşik Devletleri','Avustralya','Avusturya',
    'Belçika','Fransa','Hollanda','İngiltere','İspanya','İsveç','İsviçre',
    'İtalya','Japonya','Kanada','Norveç','Polonya','Portekiz','Rusya',
    'Suudi Arabistan','Yunanistan','Diğer',
];

const LEGAL = {
    terms: {
        title: 'Kullanıcı Sözleşmesi',
        content: `AcTiViTy KULLANICI SÖZLEŞMESİ
Son güncelleme: Haziran 2026

1. TARAFLAR
Bu Sözleşme; AcTiViTy sosyal spor platformu ("Platform") ile platforma üye olan kişi ("Kullanıcı") arasında kurulmaktadır.

2. HİZMETİN KAPSAMI
AcTiViTy; spor etkinliği düzenleme, rakip bulma, maç planlama, kort keşfetme ve spor topluluğuyla iletişim kurma hizmetleri sunan bir sosyal platformdur.

3. ÜYELİK KOŞULLARI
• Kayıt sırasında doğru ve güncel bilgi verilmesi zorunludur.
• Hesap güvenliğinden kullanıcı sorumludur; şifre gizli tutulmalıdır.
• 13 yaşından küçük bireyler platformu kullanamaz.
• Her gerçek kişi yalnızca bir hesap açabilir.
• Sahte veya yanıltıcı kimlikle kayıt yasaktır.

4. KULLANICININ YÜKÜMLÜLÜKLERI
Kullanıcı aşağıdaki eylemleri yapmamayı kabul eder:
• Başkalarının kimliğine bürünmek veya sahte profil oluşturmak
• Hakaret, taciz, tehdit veya ayrımcı içerik paylaşmak
• Platform altyapısına zarar verecek saldırı veya kötü amaçlı yazılım kullanmak
• Reklam veya ticari amaçlı izinsiz spam göndermek
• Telif hakkı, ticari sır veya başkalarının kişisel verilerini izinsiz paylaşmak
• Yasadışı bahis, doping veya şiddet içerikli materyal yaymak

5. İÇERİK VE FİKRİ MÜLKİYET
• Kullanıcının paylaştığı içerikler kendisine aittir.
• Platform, hizmet sunumu kapsamında bu içerikleri görüntüleme ve dağıtma hakkına sahiptir.
• Platformun logo, tasarım ve yazılımı AcTiViTy'e aittir; izinsiz kullanılamaz.

6. PLATFORM'UN HAKLARI
Platform, kurallara aykırı içerikleri kaldırabilir; hesabı uyarı vermeksizin askıya alabilir veya silebilir.

7. SORUMLULUK SINIRI
Platform;
• Kullanıcılar arasındaki anlaşmazlıklardan,
• Spor etkinlikleri sırasında oluşabilecek yaralanma veya maddi zarardan,
• Üçüncü taraf bağlantılarından veya içeriklerden
sorumlu tutulamaz.

8. SÖZLEŞMEDEKİ DEĞİŞİKLİKLER
Platform bu sözleşmeyi güncelleme hakkını saklı tutar. Önemli değişiklikler uygulama içi bildirim veya e-posta ile duyurulur. Platformu kullanmaya devam etmek değişikliklerin kabulü anlamına gelir.

9. UYGULANACAK HUKUK VE YETKİ
Bu sözleşme Türkiye Cumhuriyeti hukukuna tabidir. Uyuşmazlıklarda İstanbul Merkez Mahkemeleri ve İcra Daireleri yetkilidir.

10. İLETİŞİM
Sorularınız için: b.gokay007@gmail.com`,
    },
    privacy: {
        title: 'Gizlilik Politikası',
        content: `AcTiViTy GİZLİLİK POLİTİKASI
Son güncelleme: Haziran 2026

1. VERİ SORUMLUSU
AcTiViTy, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında veri sorumlusudur.
İletişim: b.gokay007@gmail.com

2. TOPLANAN KİŞİSEL VERİLER
a) Kimlik & İletişim: Ad-soyad, kullanıcı adı, e-posta adresi, telefon numarası
b) Demografik: Doğum tarihi, yaş, cinsiyet, ülke, şehir
c) Spor Aktivite: Branş tercihleri, beceri seviyesi, maç geçmişi, kort rezervasyonları, arkadaş ve rakip listeleri
d) Profil İçerikleri: Fotoğraf, biyografi, paylaşılan gönderiler (isteğe bağlı)
e) Teknik & Cihaz: IP adresi, cihaz modeli ve işletim sistemi, uygulama kullanım logları, çerezler
f) Konum: Yalnızca açık rıza alındığında, etkinlik eşleştirmesi amacıyla

3. VERİLERİN İŞLENME AMAÇLARI
• Hesap oluşturma, kimlik doğrulama ve güvenlik (OTP)
• Rakip/takım eşleştirme ve kişiselleştirilmiş etkinlik önerileri
• Bildirim ve iletişim gönderimi
• Platform performansının ölçülmesi ve iyileştirilmesi
• Yasal yükümlülüklerin yerine getirilmesi
• Anlaşmazlık çözümü ve sahtekârlık önleme

4. VERİLERİN PAYLAŞIMI
Kişisel verileriniz aşağıdaki durumlar dışında üçüncü taraflarla paylaşılmaz:
• Yasal zorunluluk: Mahkeme kararı veya yetkili kurum talebi
• Teknik hizmet sağlayıcıları: Bulut depolama, e-posta ve SMS altyapısı (gizlilik sözleşmesi kapsamında)
• Açık rızanızın bulunduğu haller

5. VERİ GÜVENLİĞİ
Verileriniz endüstri standardı şifreleme (TLS/HTTPS) ile korunmaktadır. Şifreler tek yönlü hash ile saklanır; düz metin olarak tutulmaz.

6. VERİ SAKLAMA SÜRELERİ
• Aktif hesap: Hesap silinene kadar
• Silinen hesap: Yasal zorunluluklar kapsamında 3 yıl
• Log kayıtları: 1 yıl

7. KULLANICI HAKLARI (KVKK Madde 11)
Aşağıdaki haklarınızı b.gokay007@gmail.com adresine yazılı başvuru yaparak kullanabilirsiniz:
• Kişisel verilerinizin işlenip işlenmediğini öğrenme
• Verilerinize erişim ve kopyasını talep etme
• Hatalı/eksik verilerin düzeltilmesini isteme
• Verilerin silinmesini veya yok edilmesini talep etme
• İşlemeye itiraz etme
• Verilerin taşınabilirliğini talep etme
• Zararın giderilmesini talep etme

8. ÇEREZLER
Platform; oturum yönetimi, güvenlik ve kullanıcı deneyimi geliştirme amacıyla çerez kullanır.

9. POLİTİKA DEĞİŞİKLİKLERİ
Bu politika güncellendiğinde kullanıcılar uygulama veya e-posta yoluyla bilgilendirilir.`,
    },
    kvkk: {
        title: 'KVKK / Açık Rıza Beyanı',
        content: `KVKK KAPSAMINDA AÇIK RIZA BEYANI

6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 3. ve 5. maddeleri uyarınca, AcTiViTy sosyal spor platformu ("Platform") tarafından aşağıda belirtilen kapsamda kişisel verilerimin işlenmesine özgür iradem ile açık rıza gösteriyorum.

1. İŞLENECEK KİŞİSEL VERİLER
• Kimlik verileri: Ad, soyad, kullanıcı adı
• İletişim verileri: E-posta adresi, telefon numarası
• Demografik veriler: Doğum tarihi, yaş, cinsiyet
• Konum verileri: Ülke, şehir
• Spor aktivite verileri: Branş, beceri seviyesi, maç geçmişi, performans istatistikleri
• Görsel içerikler: Profil fotoğrafı ve paylaşılan görseller (isteğe bağlı)
• Teknik veriler: Cihaz bilgisi, IP adresi, kullanım logları

2. VERİLERİN İŞLENME AMAÇLARI
• Spor etkinliği ve rakip eşleştirme hizmetinin sunulması
• Kişiselleştirilmiş içerik, bildirim ve öneri gönderimi
• Hesap güvenliği ve kimlik doğrulaması
• Platform hizmetlerinin iyileştirilmesi ve yeni özelliklerin geliştirilmesi
• Yasal yükümlülüklerin yerine getirilmesi

3. VERİ AKTARIMI
İşlenen verilerim;
• Teknik altyapı amacıyla: bulut depolama, e-posta ve SMS hizmet sağlayıcıları ile (yurt içi ve yurt dışı, gizlilik sözleşmesi kapsamında)
• Yasal zorunluluk halinde: yetkili kamu kurum ve kuruluşları ile
paylaşılabilir.

4. VERİ SAKLAMA SÜRESİ
Verilerim, üyelik süresince ve üyelik sona erdikten sonra yasal zorunluluklar çerçevesinde 3 yıl süreyle saklanacaktır.

5. HAKLARIM
KVKK'nın 11. maddesi kapsamında;
• Verilerimin işlenip işlenmediğini öğrenme
• Verilerime erişim ve kopyasını talep etme
• Hatalı verilerin düzeltilmesini isteme
• Verilerimin silinmesini talep etme
• Veri işlemeye itiraz etme
• Zararın tazminini talep etme
haklarına sahibim. Talepler için: b.gokay007@gmail.com

6. RIZA BEYANI
Bu formu onaylayarak, yukarıda açıklanan amaçlar doğrultusunda kişisel verilerimin işlenmesine, saklanmasına ve belirtilen taraflarla paylaşılmasına özgür irademle ve bilinçli şekilde açık rıza gösterdiğimi kabul ve beyan ediyorum.`,
    },
};

function genCaptcha() {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    return { q: `${a} + ${b}`, ans: String(a + b) };
}

function calcAge(dateStr) {
    if (!dateStr) return null;
    const birth = new Date(dateStr);
    if (isNaN(birth)) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 0 && age < 120 ? age : null;
}

function RegisterPage() {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const [otpSent, setOtpSent] = useState(false);
    const [otpMethod, setOtpMethod] = useState('email');
    const [form, setForm] = useState({
        fullName: '', username: '', email: '', phone: '',
        gender: '', birthDate: '', country: '', city: '', password: '',
    });
    const [showPass, setShowPass] = useState(false);
    const [otp, setOtp] = useState('');
    const [timer, setTimer] = useState(0);
    const [captcha, setCaptcha] = useState(genCaptcha);
    const [captchaInput, setCaptchaInput] = useState('');
    const [captchaOk, setCaptchaOk] = useState(false);
    const [captchaErr, setCaptchaErr] = useState(false);
    const [agreed, setAgreed] = useState({ terms: false, kvkk: false });
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);
    const [legalModal, setLegalModal] = useState(null); // { title, content }
    const timerRef = useRef(null);
    const otpBoxRef = useRef(null);
    const errorRef = useRef(null);

    useEffect(() => () => clearInterval(timerRef.current), []);

    const showError = (msg) => {
        setError(msg);
        setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    };

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const age = calcAge(form.birthDate);
    const passwordValid = PASSWORD_RULES.every(r => r.test(form.password));
    const contactValue = (otpMethod === 'email' ? form.email : form.phone).trim();

    const verifyCaptcha = () => {
        if (captchaInput.trim() === captcha.ans) {
            setCaptchaOk(true);
            setCaptchaErr(false);
        } else {
            setCaptchaErr(true);
            setCaptchaOk(false);
            setCaptcha(genCaptcha());
            setCaptchaInput('');
        }
    };

    const startTimer = () => {
        setTimer(60);
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimer(t => { if (t <= 1) { clearInterval(timerRef.current); return 0; } return t - 1; });
        }, 1000);
    };

    const handleSendOtp = async () => {
        setError(''); setInfo('');
        if (!form.username.trim()) return showError('Kullanıcı adı zorunludur');
        if (!form.email.trim() && !form.phone.trim()) return showError('En az e-posta veya telefon girilmeli');
        if (!contactValue) return showError(`Doğrulama için ${otpMethod === 'email' ? 'e-posta' : 'telefon'} girilmeli`);
        if (!form.gender) return showError('Cinsiyet seçiniz');
        if (!passwordValid) return showError('Şifre tüm kuralları karşılamalıdır');
        if (!agreed.terms) return showError('Kullanıcı Sözleşmesi\'ni kabul etmelisiniz');
        if (!agreed.kvkk) return showError('KVKK Onayı zorunludur');
        if (!captchaOk) return showError('Lütfen güvenlik sorusunu doğrulayın');

        setLoading(true);
        try {
            const res = await api.post('/auth/send-otp', {
                method: otpMethod,
                value: contactValue,
                username: form.username.trim(),
                email: form.email.trim() || undefined,
                phone: form.phone.trim() || undefined,
            });
            setOtpSent(true);
            startTimer();
            if (res.data.devCode) {
                setInfo(`Geliştirici modu — doğrulama kodunuz: ${res.data.devCode}`);
            }
            setTimeout(() => otpBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        } catch (e) {
            showError(e.response?.data?.message || e.message || 'Doğrulama kodu gönderilemedi');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        setError(''); setInfo('');
        if (otp.length !== 6) return showError('6 haneli kodu girin');
        setLoading(true);
        try {
            await api.post('/auth/verify-otp', { method: otpMethod, value: contactValue, code: otp });
            const { data } = await api.post('/auth/register', {
                username: form.username.trim(),
                password: form.password,
                fullName: form.fullName.trim() || undefined,
                email: form.email.trim() || undefined,
                phone: form.phone.trim() || undefined,
                gender: form.gender || undefined,
                birthDate: form.birthDate || undefined,
                country: form.country || undefined,
                city: form.city.trim() || undefined,
            });
            dispatch(setCredentials(data));
            navigate('/home');
        } catch (e) {
            showError(e.response?.data?.message || 'Doğrulama başarısız');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 relative">

            {/* Yasal Metin Modal */}
            {legalModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
                            <h3 className="text-white font-bold text-lg">{legalModal.title}</h3>
                            <button onClick={() => setLegalModal(null)} className="text-gray-400 hover:text-white text-2xl leading-none transition">✕</button>
                        </div>
                        <div className="overflow-y-auto px-6 py-4 flex-1">
                            <pre className="text-gray-300 text-xs leading-6 whitespace-pre-wrap font-sans">{legalModal.content}</pre>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-800 flex-shrink-0">
                            <button onClick={() => setLegalModal(null)}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl transition text-sm">
                                Kapat
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="w-full max-w-lg">
                <div className="text-center mb-6">
                    <h1 className="text-5xl font-black tracking-tight">
                        {'AcTiViTy'.split('').map((ch, i) => (
                            <span key={i} className="logo-letter" style={{ animationDelay: `${-(7 - i) * 0.3}s` }}>{ch}</span>
                        ))}
                    </h1>
                    <p className="text-gray-400 mt-2 text-sm">
                        Hesabını oluştur
                    </p>
                </div>

                <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">

                    {error && (
                        <div ref={errorRef} className="bg-red-500/10 border border-red-500/40 text-red-400 rounded-lg p-3 mb-4 text-sm font-medium">
                            {error}
                        </div>
                    )}
                    {info && (
                        <div className="bg-purple-500/10 border border-purple-500/40 text-purple-300 rounded-lg p-3 mb-4 text-sm font-medium">
                            {info}
                        </div>
                    )}

                    {/* ── KAYIT FORMU ── */}
                    {true && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-bold text-white">Hesap Bilgileri</h2>

                            {/* Ad Soyad + Kullanıcı Adı */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 block">Ad Soyad</label>
                                    <input type="text" value={form.fullName} onChange={e => set('fullName', e.target.value)}
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                        placeholder="Adın Soyadın" />
                                </div>
                                <div>
                                    <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 block">Kullanıcı Adı *</label>
                                    <input type="text" value={form.username} onChange={e => set('username', e.target.value)}
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                        placeholder="kullanici_adi" autoComplete="off" />
                                </div>
                            </div>

                            {/* E-posta + Telefon */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 block">E-posta</label>
                                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                        placeholder="email@ornek.com" />
                                </div>
                                <div>
                                    <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 block">Cep Telefonu</label>
                                    <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                        placeholder="+90 555 000 00 00" />
                                </div>
                            </div>

                            {/* OTP Yöntemi */}
                            <div>
                                <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">Doğrulama Kodu Gönderilsin *</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => setOtpMethod('email')}
                                        className={`py-2.5 rounded-xl border font-bold text-sm transition ${otpMethod === 'email' ? 'border-purple-500 bg-purple-500/15 text-purple-300' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'}`}>
                                        📧 E-posta ile
                                    </button>
                                    <div className="relative py-2.5 rounded-xl border border-gray-700 bg-gray-800 text-gray-600 text-sm font-bold text-center opacity-40 cursor-not-allowed">
                                        📱 Telefon ile
                                        <span className="absolute -top-2 -right-1 bg-gray-700 text-gray-400 text-[9px] font-black px-1.5 py-0.5 rounded-full">Yakında</span>
                                    </div>
                                </div>
                            </div>

                            {/* Cinsiyet */}
                            <div>
                                <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">Cinsiyet *</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[['MALE','👨 Erkek'],['FEMALE','👩 Kadın'],['OTHER','🧑 Diğer']].map(([val, lbl]) => (
                                        <button key={val} type="button" onClick={() => set('gender', val)}
                                            className={`py-2.5 rounded-xl border font-bold text-sm transition ${form.gender === val ? 'border-purple-500 bg-purple-500/15 text-purple-300' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'}`}>
                                            {lbl}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Doğum Tarihi */}
                            <div>
                                <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 block">Doğum Tarihi</label>
                                <div className="flex items-center gap-3">
                                    <input type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)}
                                        className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm [color-scheme:dark]" />
                                    {age !== null && (
                                        <div className="bg-purple-500/20 border border-purple-500/40 rounded-xl px-3 py-2.5 whitespace-nowrap">
                                            <span className="text-purple-300 font-black text-sm">{age} yaş</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Ülke + Şehir */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 block">Ülke</label>
                                    <select value={form.country} onChange={e => set('country', e.target.value)}
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm">
                                        <option value="">Ülke seçin</option>
                                        {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 block">İl / Şehir</label>
                                    <input type="text" value={form.city} onChange={e => set('city', e.target.value)}
                                        className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                                        placeholder="İstanbul" />
                                </div>
                            </div>

                            {/* Şifre */}
                            <div>
                                <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 block">Şifre *</label>
                                <div className="flex">
                                    <input type={showPass ? 'text' : 'password'} value={form.password}
                                        onChange={e => set('password', e.target.value.slice(0, 16))} maxLength={16}
                                        className="flex-1 bg-gray-800 text-white rounded-l-xl px-3 py-2.5 border border-gray-700 border-r-0 focus:outline-none focus:border-purple-500 text-sm"
                                        placeholder="••••••••" />
                                    <button type="button" onClick={() => setShowPass(p => !p)}
                                        className="bg-gray-800 border border-gray-700 rounded-r-xl px-3 text-lg hover:border-gray-600 transition">
                                        {showPass ? '🙈' : '👁️'}
                                    </button>
                                </div>
                                {form.password.length > 0 && (
                                    <div className="mt-2 grid grid-cols-2 gap-1">
                                        {PASSWORD_RULES.map(r => (
                                            <p key={r.id} className={`text-xs font-semibold ${r.test(form.password) ? 'text-green-400' : 'text-red-400'}`}>
                                                {r.test(form.password) ? '✓' : '✗'} {r.label}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Onaylar */}
                            <div className="border-t border-gray-800 pt-4 space-y-3">
                                <label className="flex items-start gap-3 cursor-pointer group">
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition ${agreed.terms ? 'bg-purple-600 border-purple-600' : 'border-gray-600 group-hover:border-purple-500'}`}
                                        onClick={() => setAgreed(a => ({ ...a, terms: !a.terms }))}>
                                        {agreed.terms && <span className="text-white text-xs font-black">✓</span>}
                                    </div>
                                    <span className="text-gray-400 text-xs leading-5">
                                        <button type="button" onClick={() => setLegalModal(LEGAL.terms)} className="text-purple-400 hover:text-purple-300 font-semibold">Kullanıcı Sözleşmesi</button>
                                        {' '}ve{' '}
                                        <button type="button" onClick={() => setLegalModal(LEGAL.privacy)} className="text-purple-400 hover:text-purple-300 font-semibold">Gizlilik Politikası</button>
                                        {'\'nı okudum ve kabul ediyorum *'}
                                    </span>
                                </label>

                                <label className="flex items-start gap-3 cursor-pointer group">
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition ${agreed.kvkk ? 'bg-purple-600 border-purple-600' : 'border-gray-600 group-hover:border-purple-500'}`}
                                        onClick={() => setAgreed(a => ({ ...a, kvkk: !a.kvkk }))}>
                                        {agreed.kvkk && <span className="text-white text-xs font-black">✓</span>}
                                    </div>
                                    <span className="text-gray-400 text-xs leading-5">
                                        <button type="button" onClick={() => setLegalModal(LEGAL.kvkk)} className="text-purple-400 hover:text-purple-300 font-semibold">KVKK / Açık Rıza Beyanı</button>
                                        {"'nı okudum ve onaylıyorum *"}
                                    </span>
                                </label>
                            </div>

                            {/* Captcha */}
                            <div className={`bg-gray-800 border rounded-xl p-4 ${captchaOk ? 'border-green-500/60' : captchaErr ? 'border-red-500/60' : 'border-gray-700'}`}>
                                {captchaOk ? (
                                    <div className="flex items-center gap-3">
                                        <span className="text-3xl">✅</span>
                                        <div>
                                            <p className="text-green-400 font-bold text-sm">Ben robot değilim</p>
                                            <p className="text-green-300 font-semibold text-sm">Doğrulandı ✓</p>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-3xl">🤖</span>
                                            <div>
                                                <p className="text-white font-bold text-sm">Ben robot değilim</p>
                                                <p className={`font-black text-xl ${captchaErr ? 'text-red-400' : 'text-purple-400'}`}>{captcha.q} = ?</p>
                                                {captchaErr && <p className="text-red-400 text-xs font-semibold">Yanlış! Yeni soru geldi</p>}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text" inputMode="numeric" value={captchaInput}
                                                onChange={e => setCaptchaInput(e.target.value.replace(/\D/g,'').slice(0,2))}
                                                onKeyDown={e => e.key === 'Enter' && captchaInput && verifyCaptcha()}
                                                className="flex-1 bg-gray-900 text-white rounded-xl border border-gray-600 focus:border-purple-500 focus:outline-none text-center text-xl font-black py-2"
                                                placeholder="?" maxLength={2}
                                            />
                                            <button type="button" onClick={verifyCaptcha} disabled={!captchaInput}
                                                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold px-4 rounded-xl transition text-sm">
                                                Doğrula
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            <button
                                onClick={handleSendOtp}
                                disabled={loading || otpSent}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-40"
                            >
                                {loading ? 'Gönderiliyor...' : otpSent ? '✓ Kod Gönderildi' : 'Doğrulama Kodu Gönder →'}
                            </button>

                            {/* Inline OTP kutusu */}
                            {otpSent && (
                                <div ref={otpBoxRef} className="bg-gray-800 border border-purple-500/40 rounded-xl p-4 space-y-3">
                                    <p className="text-gray-300 text-sm text-center">
                                        {otpMethod === 'email' ? '📧' : '📱'}{' '}
                                        <span className="text-purple-400 font-bold">{contactValue}</span>
                                        {' '}adresine kod gönderildi
                                    </p>
                                    <div>
                                        <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">Doğrulama Kodu *</label>
                                        <input
                                            type="text" inputMode="numeric" maxLength={6} autoFocus
                                            value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                                            className="w-full bg-gray-900 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500 text-center text-3xl font-black tracking-[1rem]"
                                            placeholder="······"
                                        />
                                    </div>
                                    <button onClick={handleVerify} disabled={loading}
                                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-50">
                                        {loading ? 'Oluşturuluyor...' : 'Hesabı Oluştur ✓'}
                                    </button>
                                    <button
                                        onClick={timer === 0 ? () => { setOtpSent(false); setTimeout(handleSendOtp, 50); } : undefined}
                                        disabled={timer > 0}
                                        className="w-full text-purple-400 text-xs font-bold disabled:opacity-40 py-1">
                                        {timer > 0 ? `Tekrar gönder (${timer}s)` : 'Kodu tekrar gönder'}
                                    </button>
                                </div>
                            )}

                            <p className="text-gray-400 text-center text-sm">
                                Zaten hesabın var mı?{' '}
                                <Link to="/login" className="text-purple-400 hover:text-purple-300 font-semibold">Giriş Yap</Link>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default RegisterPage;
