import { useState, useRef, useEffect } from 'react';
import RainbowLogo from '../../components/RainbowLogo';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
    Alert, Modal, FlatList,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { setCredentials } from '../../store/slices/authSlice';
import { setLang } from '../../store/slices/langSlice';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import CityPickerModal from '../../components/CityPickerModal';

const PASSWORD_TESTS = [
    { id: 'len',     key: 'passRuleLen',     test: p => p.length >= 8 && p.length <= 16 },
    { id: 'upper',   key: 'passRuleUpper',   test: p => /[A-Z]/.test(p) },
    { id: 'lower',   key: 'passRuleLower',   test: p => /[a-z]/.test(p) },
    { id: 'special', key: 'passRuleSpecial', test: p => /[^a-zA-Z0-9]/.test(p) },
];

const COUNTRIES = [
    'Türkiye','Almanya','Amerika Birleşik Devletleri','Avustralya','Avusturya',
    'Belçika','Fransa','Hollanda','İngiltere','İspanya','İsveç','İsviçre',
    'İtalya','Japonya','Kanada','Norveç','Polonya','Portekiz','Rusya',
    'Suudi Arabistan','Yunanistan','Diğer',
];

const DIAL_CODES = [
    { flag: '🇹🇷', name: 'Türkiye', dial: '+90' },
    { flag: '🇺🇸', name: 'USA', dial: '+1' },
    { flag: '🇬🇧', name: 'UK', dial: '+44' },
    { flag: '🇩🇪', name: 'Almanya', dial: '+49' },
    { flag: '🇫🇷', name: 'Fransa', dial: '+33' },
    { flag: '🇮🇹', name: 'İtalya', dial: '+39' },
    { flag: '🇪🇸', name: 'İspanya', dial: '+34' },
    { flag: '🇳🇱', name: 'Hollanda', dial: '+31' },
    { flag: '🇧🇪', name: 'Belçika', dial: '+32' },
    { flag: '🇵🇱', name: 'Polonya', dial: '+48' },
    { flag: '🇵🇹', name: 'Portekiz', dial: '+351' },
    { flag: '🇸🇪', name: 'İsveç', dial: '+46' },
    { flag: '🇨🇭', name: 'İsviçre', dial: '+41' },
    { flag: '🇦🇹', name: 'Avusturya', dial: '+43' },
    { flag: '🇳🇴', name: 'Norveç', dial: '+47' },
    { flag: '🇬🇷', name: 'Yunanistan', dial: '+30' },
    { flag: '🇷🇺', name: 'Rusya', dial: '+7' },
    { flag: '🇸🇦', name: 'Suudi Arabistan', dial: '+966' },
    { flag: '🇯🇵', name: 'Japonya', dial: '+81' },
    { flag: '🇦🇺', name: 'Avustralya', dial: '+61' },
    { flag: '🇨🇦', name: 'Kanada', dial: '+1 CA' },
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
Platform; oturum yönetimi, güvenlik ve kullanıcı deneyimi geliştirme amacıyla çerez kullanır. Ayarlar bölümünden yönetilebilir.

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
haklarına sahibim.

Taleplerim için: b.gokay007@gmail.com adresine yazılı başvuru yapabilirim. Başvurular yasal süre olan 30 gün içinde yanıtlanır.

6. RIZA BEYANI
Bu formu onaylayarak, yukarıda açıklanan amaçlar doğrultusunda kişisel verilerimin işlenmesine, saklanmasına ve belirtilen taraflarla paylaşılmasına özgür irademle ve bilinçli şekilde açık rıza gösterdiğimi kabul ve beyan ediyorum.`,
    },
};

const genCaptcha = () => {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    return { q: `${a} + ${b}`, ans: String(a + b) };
};

function calcAge(day, month, year) {
    if (!day || !month || !year || String(year).length < 4) return null;
    const d = parseInt(day), m = parseInt(month), y = parseInt(year);
    if (isNaN(d) || isNaN(m) || isNaN(y) || d < 1 || d > 31 || m < 1 || m > 12) return null;
    const today = new Date();
    let age = today.getFullYear() - y;
    if (today.getMonth() + 1 - m < 0 || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
    return age >= 0 && age < 120 ? age : null;
}

export default function RegisterScreen({ navigation }) {
    const dispatch = useDispatch();
    const lang = useSelector(s => s.lang?.lang || 'en');
    const t = useT();
    const [otpSent, setOtpSent] = useState(false);
    const [otpMethod, setOtpMethod] = useState('email');
    const [form, setForm] = useState({
        fullName: '', username: '', email: '', phone: '',
        gender: '', bDay: '', bMonth: '', bYear: '',
        country: '', city: '', password: '',
    });
    const [dialCode, setDialCode] = useState(DIAL_CODES[0]);
    const [showDialPicker, setShowDialPicker] = useState(false);
    const [showPass, setShowPass] = useState(false);
    const [showCountryPicker, setShowCountryPicker] = useState(false);
    const [showCityPicker, setShowCityPicker] = useState(false);
    const [otp, setOtp] = useState('');
    const [timer, setTimer] = useState(0);
    const [loading, setLoading] = useState(false);
    const [captcha, setCaptcha] = useState(genCaptcha);
    const [captchaInput, setCaptchaInput] = useState('');
    const [captchaOk, setCaptchaOk] = useState(false);
    const [captchaErr, setCaptchaErr] = useState(false);
    const [agreed, setAgreed] = useState({ terms: false, kvkk: false });
    const [legalModal, setLegalModal] = useState(null); // { title, content }
    const timerRef = useRef(null);
    const scrollRef = useRef(null);

    useEffect(() => () => clearInterval(timerRef.current), []);


    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const age = calcAge(form.bDay, form.bMonth, form.bYear);
    const passwordValid = PASSWORD_TESTS.every(r => r.test(form.password));
    const fullPhone = form.phone.trim() ? dialCode.dial + form.phone.trim() : '';
    const contactValue = (otpMethod === 'email' ? form.email : fullPhone).trim();

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
        if (!form.username.trim()) return Alert.alert(t.missingField, t.usernameRequired);
        if (!form.email.trim() && !form.phone.trim()) return Alert.alert(t.missingField, t.contactRequired);
        if (!contactValue) return Alert.alert(t.missingField, t.contactRequired);
        if (!form.gender) return Alert.alert(t.missingField, t.gender);
        if (!passwordValid) return Alert.alert(t.error, t.passwordRules);
        if (!agreed.terms) return Alert.alert(t.missingField, t.termsRequired);
        if (!agreed.kvkk) return Alert.alert(t.missingField, t.kvkkRequired);
        if (!captchaOk) return Alert.alert(t.missingField, t.captchaRequired);

        setLoading(true);
        try {
            const res = await api.post('/auth/send-otp', {
                method: otpMethod,
                value: contactValue,
                username: form.username.trim(),
                email: form.email.trim() || undefined,
                phone: fullPhone || undefined,
            });
            setOtpSent(true);
            startTimer();
            if (res.data.devCode) {
                Alert.alert('Geliştirici Modu', `Doğrulama kodunuz:\n\n${res.data.devCode}`, [{ text: 'Tamam' }]);
            }
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.otpSendFailed);
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        if (otp.length !== 6) return Alert.alert(t.error, t.otpSixDigits);
        setLoading(true);
        try {
            await api.post('/auth/verify-otp', { method: otpMethod, value: contactValue, code: otp });

            const birthDate = form.bYear && form.bMonth && form.bDay
                ? `${form.bYear}-${form.bMonth.padStart(2,'0')}-${form.bDay.padStart(2,'0')}`
                : undefined;

            const { data } = await api.post('/auth/register', {
                username: form.username.trim(),
                password: form.password,
                fullName: form.fullName.trim() || undefined,
                email: form.email.trim() || undefined,
                phone: fullPhone || undefined,
                gender: form.gender || undefined,
                birthDate,
                country: form.country || undefined,
                city: form.city.trim() || undefined,
            });
            dispatch(setCredentials({ user: data.user, token: data.token }));
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.otpVerifyFailed);
        } finally {
            setLoading(false);
        }
    };

    // ── KAYIT FORMU ───────────────────────────────────────────────────────────
    return (
        <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

            {/* Yasal Metin Modal */}
            <Modal visible={!!legalModal} transparent animationType="slide" onRequestClose={() => setLegalModal(null)}>
                <View style={s.pickerOverlay}>
                    <View style={[s.pickerBox, { maxHeight: '85%' }]}>
                        <View style={s.pickerHeader}>
                            <Text style={s.pickerTitle}>{legalModal?.title}</Text>
                            <TouchableOpacity onPress={() => setLegalModal(null)}>
                                <Text style={s.pickerClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ paddingHorizontal: 17 }} showsVerticalScrollIndicator>
                            <Text style={s.legalText}>{legalModal?.content}</Text>
                            <View style={{ height: 40 }} />
                        </ScrollView>
                        <TouchableOpacity
                            style={[s.btn, { margin: 16 }]}
                            onPress={() => setLegalModal(null)}
                        >
                            <Text style={s.btnText}>Kapat</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Ülke Kodu (Dial) Seçici Modal */}
            <Modal visible={showDialPicker} transparent animationType="slide" onRequestClose={() => setShowDialPicker(false)}>
                <View style={s.pickerOverlay}>
                    <View style={s.pickerBox}>
                        <View style={s.pickerHeader}>
                            <Text style={s.pickerTitle}>{t.dialCodeLabel}</Text>
                            <TouchableOpacity onPress={() => setShowDialPicker(false)}>
                                <Text style={s.pickerClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={DIAL_CODES}
                            keyExtractor={i => i.dial + i.name}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[s.pickerItem, dialCode.dial === item.dial && dialCode.name === item.name && s.pickerItemActive]}
                                    onPress={() => { setDialCode(item); setShowDialPicker(false); }}
                                >
                                    <Text style={{ fontSize: 22, marginRight: 10 }}>{item.flag}</Text>
                                    <Text style={[s.pickerItemText, { flex: 1 }]}>{item.name}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700' }}>{item.dial}</Text>
                                    {dialCode.dial === item.dial && dialCode.name === item.name && (
                                        <Text style={{ color: colors.purple, fontSize: 16, marginLeft: 8 }}>✓</Text>
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            {/* Ülke Seçici Modal */}
            <Modal visible={showCountryPicker} transparent animationType="slide" onRequestClose={() => setShowCountryPicker(false)}>
                <View style={s.pickerOverlay}>
                    <View style={s.pickerBox}>
                        <View style={s.pickerHeader}>
                            <Text style={s.pickerTitle}>{t.countryPickerTitle}</Text>
                            <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                                <Text style={s.pickerClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={COUNTRIES}
                            keyExtractor={i => i}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[s.pickerItem, form.country === item && s.pickerItemActive]}
                                    onPress={() => { set('country', item); setShowCountryPicker(false); }}
                                >
                                    <Text style={[s.pickerItemText, form.country === item && s.pickerItemTextActive]}>{item}</Text>
                                    {form.country === item && <Text style={{ color: colors.purple, fontSize: 16 }}>✓</Text>}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            <CityPickerModal
                visible={showCityPicker}
                onClose={() => setShowCityPicker(false)}
                onSelect={v => set('city', v)}
                currentValue={form.city}
            />

            <ScrollView ref={scrollRef} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
                {/* Language selector */}
                <View style={{ flexDirection: 'row', gap: 3, alignSelf: 'flex-end', marginBottom: 16 }}>
                    {['tr', 'en'].map(l => (
                        <TouchableOpacity
                            key={l}
                            onPress={() => dispatch(setLang(l))}
                            style={{
                                borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3,
                                backgroundColor: lang === l ? colors.purple + '30' : colors.surface2,
                            }}
                        >
                            <Text style={{ color: lang === l ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '800' }}>
                                {l === 'tr' ? '🇹🇷 TR' : '🇬🇧 EN'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <RainbowLogo style={{ fontSize: 34, marginBottom: 4 }} />
                <Text style={s.sub}>{t.createAccount}</Text>

                <View style={s.card}>

                    {/* Full Name */}
                    <Text style={s.label}>{t.fullName}</Text>
                    <TextInput style={s.input} value={form.fullName} onChangeText={v => set('fullName', v)}
                        placeholder={t.fullNamePh} placeholderTextColor={colors.textMuted} />

                    {/* Username */}
                    <Text style={s.label}>{t.username}</Text>
                    <TextInput style={s.input} value={form.username} onChangeText={v => set('username', v)}
                        placeholder={t.usernamePh} placeholderTextColor={colors.textMuted} autoCapitalize="none" />

                    {/* Email */}
                    <Text style={s.label}>{t.email}</Text>
                    <TextInput style={s.input} value={form.email} onChangeText={v => set('email', v)}
                        placeholder={t.emailPh} placeholderTextColor={colors.textMuted}
                        keyboardType="email-address" autoCapitalize="none" />

                    {/* Phone */}
                    <Text style={s.label}>{t.phone}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                            style={[s.input, s.dialBtn]}
                            onPress={() => setShowDialPicker(true)}
                        >
                            <Text style={{ fontSize: 18 }}>{dialCode.flag}</Text>
                            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{dialCode.dial}</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 11 }}>▾</Text>
                        </TouchableOpacity>
                        <TextInput
                            style={[s.input, { flex: 1 }]}
                            value={form.phone}
                            onChangeText={v => set('phone', v.replace(/\D/g, ''))}
                            placeholder={t.phonePh}
                            placeholderTextColor={colors.textMuted}
                            keyboardType="phone-pad"
                        />
                    </View>

                    {/* OTP Method */}
                    <Text style={s.label}>{t.otpMethodLabel} *</Text>
                    <View style={s.methodRow}>
                        <TouchableOpacity
                            style={[s.methodBtn, otpMethod === 'email' && s.methodBtnActive]}
                            onPress={() => setOtpMethod('email')}>
                            <Text style={[s.methodText, otpMethod === 'email' && s.methodTextActive]}>{t.viaEmail}</Text>
                        </TouchableOpacity>
                        <View style={[s.methodBtn, { opacity: 0.4 }]}>
                            <Text style={s.methodText}>{t.viaPhone}</Text>
                            <Text style={s.comingSoon}>{t.comingSoon}</Text>
                        </View>
                    </View>

                    {/* Gender */}
                    <Text style={s.label}>{t.gender}</Text>
                    <View style={s.genderRow}>
                        {[['MALE', t.male],['FEMALE', t.female],['OTHER', t.otherGender]].map(([val, lbl]) => (
                            <TouchableOpacity key={val}
                                style={[s.genderBtn, form.gender === val && s.genderBtnActive]}
                                onPress={() => set('gender', val)}>
                                <Text style={[s.genderText, form.gender === val && s.genderTextActive]}>{lbl}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Birth Date */}
                    <Text style={s.label}>{t.birthDate}</Text>
                    <View style={s.birthRow}>
                        <TextInput style={[s.input, s.birthCell]} value={form.bDay}
                            onChangeText={v => set('bDay', v.replace(/\D/g, '').slice(0, 2))}
                            placeholder="GG" placeholderTextColor={colors.textMuted}
                            keyboardType="numeric" maxLength={2} textAlign="center" />
                        <TextInput style={[s.input, s.birthCell]} value={form.bMonth}
                            onChangeText={v => set('bMonth', v.replace(/\D/g, '').slice(0, 2))}
                            placeholder="AA" placeholderTextColor={colors.textMuted}
                            keyboardType="numeric" maxLength={2} textAlign="center" />
                        <TextInput style={[s.input, s.birthCellYear]} value={form.bYear}
                            onChangeText={v => set('bYear', v.replace(/\D/g, '').slice(0, 4))}
                            placeholder="YYYY" placeholderTextColor={colors.textMuted}
                            keyboardType="numeric" maxLength={4} textAlign="center" />
                        {age !== null && (
                            <View style={s.ageBadge}><Text style={s.ageText}>{age} {t.years}</Text></View>
                        )}
                    </View>

                    {/* Country */}
                    <Text style={s.label}>{t.country}</Text>
                    <TouchableOpacity style={[s.input, s.selectBtn]} onPress={() => setShowCountryPicker(true)}>
                        <Text style={form.country ? s.selectText : s.selectPlaceholder}>
                            {form.country || t.selectCountry}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 16 }}>▾</Text>
                    </TouchableOpacity>

                    {/* City */}
                    <Text style={s.label}>{t.city}</Text>
                    <TouchableOpacity style={[s.input, s.selectBtn]} onPress={() => setShowCityPicker(true)}>
                        <Text style={form.city ? s.selectText : s.selectPlaceholder}>
                            {form.city || t.selectCity}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 16 }}>▾</Text>
                    </TouchableOpacity>

                    {/* Password */}
                    <Text style={s.label}>{t.password} *</Text>
                    <View style={s.passRow}>
                        <TextInput
                            style={[s.input, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 }]}
                            value={form.password}
                            onChangeText={v => set('password', v.slice(0, 16))}
                            placeholder="••••••••" placeholderTextColor={colors.textMuted}
                            secureTextEntry={!showPass} maxLength={16}
                        />
                        <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPass(p => !p)}>
                            <Text style={s.eyeText}>{showPass ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                    </View>
                    {form.password.length > 0 && (
                        <View style={s.rulesBox}>
                            {PASSWORD_TESTS.map(r => (
                                <Text key={r.id} style={r.test(form.password) ? s.ruleOk : s.ruleFail}>
                                    {r.test(form.password) ? '✓' : '✗'} {t[r.key]}
                                </Text>
                            ))}
                        </View>
                    )}

                    {/* ── Onaylar ── */}
                    <View style={s.divider} />

                    <TouchableOpacity style={s.checkRow} onPress={() => setAgreed(a => ({ ...a, terms: !a.terms }))}>
                        <View style={[s.checkbox, agreed.terms && s.checkboxChecked]}>
                            {agreed.terms && <Text style={s.checkmark}>✓</Text>}
                        </View>
                        <Text style={s.checkLabel}>
                            <Text style={s.checkLink} onPress={() => setLegalModal(LEGAL.terms)}>
                                Kullanıcı Sözleşmesi
                            </Text>
                            {' '}ve{' '}
                            <Text style={s.checkLink} onPress={() => setLegalModal(LEGAL.privacy)}>
                                Gizlilik Politikası
                            </Text>
                            {"'nı okudum ve kabul ediyorum *"}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={s.checkRow} onPress={() => setAgreed(a => ({ ...a, kvkk: !a.kvkk }))}>
                        <View style={[s.checkbox, agreed.kvkk && s.checkboxChecked]}>
                            {agreed.kvkk && <Text style={s.checkmark}>✓</Text>}
                        </View>
                        <Text style={s.checkLabel}>
                            <Text style={s.checkLink} onPress={() => setLegalModal(LEGAL.kvkk)}>
                                KVKK / Açık Rıza Beyanı
                            </Text>
                            {"'nı okudum ve onaylıyorum *"}
                        </Text>
                    </TouchableOpacity>

                    {/* ── Captcha ── */}
                    <View style={[s.captchaBox, captchaOk && { borderColor: '#4ade80' }, captchaErr && { borderColor: '#f87171' }]}>
                        <View style={s.captchaLeft}>
                            <Text style={s.captchaIcon}>{captchaOk ? '✅' : '🤖'}</Text>
                            <View>
                                <Text style={s.captchaTitle}>{t.iAmNotRobot}</Text>
                                {captchaOk
                                    ? <Text style={{ color: '#4ade80', fontWeight: '800', fontSize: 13 }}>{t.verifiedCaptcha}</Text>
                                    : <Text style={[s.captchaQ, captchaErr && { color: '#f87171' }]}>{captcha.q} = ?</Text>
                                }
                                {captchaErr && <Text style={{ color: '#f87171', fontSize: 10, marginTop: 2 }}>{t.captchaWrong}</Text>}
                            </View>
                        </View>
                        {!captchaOk && (
                            <View style={s.captchaRight}>
                                <TextInput
                                    style={[s.input, s.captchaInput]}
                                    value={captchaInput}
                                    onChangeText={v => { setCaptchaInput(v.replace(/\D/g, '').slice(0, 2)); setCaptchaErr(false); }}
                                    keyboardType="numeric"
                                    placeholder="?"
                                    placeholderTextColor={colors.textMuted}
                                    maxLength={2}
                                    textAlign="center"
                                />
                                <TouchableOpacity
                                    style={[s.captchaVerifyBtn, !captchaInput && { opacity: 0.4 }]}
                                    onPress={verifyCaptcha}
                                    disabled={!captchaInput}
                                >
                                    <Text style={s.captchaVerifyText}>{t.doVerify}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    <TouchableOpacity
                        style={[s.btn, s.sendBtn, (!passwordValid || !form.gender || !agreed.terms || !agreed.kvkk) && { opacity: 0.5 }]}
                        onPress={handleSendOtp}
                        disabled={loading || otpSent}
                    >
                        {loading
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={s.btnText}>{otpSent ? t.codeSent : t.sendCode}</Text>}
                    </TouchableOpacity>

                    {/* ── Inline OTP Kutusu ── */}
                    {otpSent && (
                        <View style={s.otpInlineBox}>
                            <Text style={s.otpInfo}>
                                {otpMethod === 'email' ? '📧' : '📱'}{' '}
                                <Text style={{ color: colors.purpleLight, fontWeight: '700' }}>{contactValue}</Text>
                                {' '}{t.codeSentTo}
                            </Text>
                            <Text style={s.label}>{t.verificationCodeLabel}</Text>
                            <TextInput
                                style={[s.input, s.otpInput]}
                                value={otp}
                                onChangeText={v => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                                keyboardType="numeric"
                                maxLength={6}
                                placeholder="• • • • • •"
                                placeholderTextColor={colors.textMuted}
                                textAlign="center"
                                autoFocus
                            />
                            <TouchableOpacity style={s.btn} onPress={handleVerify} disabled={loading}>
                                {loading
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={s.btnText}>{t.createAccountBtn}</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={timer === 0 ? () => { setOtpSent(false); setTimeout(handleSendOtp, 100); } : undefined}
                                style={[s.resendRow, timer > 0 && { opacity: 0.4 }]}
                                disabled={timer > 0}
                            >
                                <Text style={s.resendText}>
                                    {timer > 0 ? t.resendTimer(timer) : t.resendCode}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <TouchableOpacity onPress={() => navigation.navigate('Login')} style={s.linkRow}>
                        <Text style={s.linkText}>{t.alreadyHaveAccount} <Text style={s.link}>{t.signIn}</Text></Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 17, paddingVertical: 37 },
    logo: { fontSize: 34, fontWeight: '900', color: '#fff', textAlign: 'center', letterSpacing: 2, marginBottom: 4 },
    sub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },
    card: { backgroundColor: colors.surface, borderRadius: 20, padding: 15, borderWidth: 1, borderColor: colors.border },

    label: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', marginBottom: 5, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
    input: { backgroundColor: colors.surface2, color: colors.text, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, fontSize: 14 },

    // Method toggle
    methodRow: { flexDirection: 'row', gap: 3 },
    methodBtn: { flex: 1, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: 'center' },
    methodBtnActive: { borderColor: colors.purple, backgroundColor: colors.purple + '22' },
    methodText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
    methodTextActive: { color: colors.purpleLight, fontWeight: '800' },
    comingSoon: { color: colors.textMuted, fontSize: 9, fontWeight: '700', marginTop: 2 },

    // Gender
    genderRow: { flexDirection: 'row', gap: 3 },
    genderBtn: { flex: 1, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: 'center' },
    genderBtnActive: { borderColor: colors.purple, backgroundColor: colors.purple + '22' },
    genderText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
    genderTextActive: { color: colors.purpleLight, fontWeight: '800' },

    // Birth date
    birthRow: { flexDirection: 'row', gap: 3, alignItems: 'center' },
    birthCell: { flex: 1, textAlign: 'center' },
    birthCellYear: { flex: 1.6, textAlign: 'center' },
    ageBadge: { backgroundColor: colors.purple + '25', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 6, borderWidth: 1, borderColor: colors.purple + '60' },
    ageText: { color: colors.purpleLight, fontWeight: '800', fontSize: 12 },

    // Dial code button
    dialBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minWidth: 80 },

    // Country select
    selectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    selectText: { color: colors.text, fontSize: 14 },
    selectPlaceholder: { color: colors.textMuted, fontSize: 14 },

    // Password
    passRow: { flexDirection: 'row' },
    eyeBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 0, borderTopRightRadius: 12, borderBottomRightRadius: 12, paddingHorizontal: 11, justifyContent: 'center' },
    eyeText: { fontSize: 17 },
    rulesBox: { marginTop: 6, gap: 3, paddingLeft: 0 },
    ruleOk: { color: '#4ade80', fontSize: 11, fontWeight: '600' },
    ruleFail: { color: '#f87171', fontSize: 11, fontWeight: '600' },

    // Divider
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },

    // Checkboxes
    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 3, marginBottom: 10 },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
    checkboxChecked: { backgroundColor: colors.purple, borderColor: colors.purple },
    checkmark: { color: '#fff', fontSize: 12, fontWeight: '900' },
    checkLabel: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, flex: 1 },
    checkLink: { color: colors.purpleLight, fontWeight: '700' },

    // Captcha
    captchaBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface2, borderRadius: 14, padding: 11, borderWidth: 1, borderColor: colors.border, marginTop: 4, marginBottom: 4 },
    captchaLeft: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
    captchaRight: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    captchaIcon: { fontSize: 26 },
    captchaTitle: { color: '#fff', fontWeight: '800', fontSize: 12 },
    captchaQ: { color: colors.purple, fontWeight: '900', fontSize: 18, marginTop: 2 },
    captchaInput: { width: 48, textAlign: 'center', fontSize: 18, fontWeight: '900' },
    captchaVerifyBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 5 },
    captchaVerifyText: { color: '#fff', fontWeight: '800', fontSize: 11 },

    // Button
    btn: { backgroundColor: colors.purple, borderRadius: 14, paddingVertical: 11, alignItems: 'center', marginTop: 18 },
    sendBtn: { marginTop: 18 },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    linkRow: { marginTop: 14, alignItems: 'center' },
    linkText: { color: colors.textSecondary, fontSize: 13 },
    link: { color: colors.purpleLight, fontWeight: '700' },

    // Inline OTP
    otpInlineBox: { marginTop: 16, backgroundColor: colors.surface2, borderRadius: 16, padding: 13, borderWidth: 1, borderColor: colors.purple + '50' },
    otpInfo: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 4, textAlign: 'center' },
    otpInput: { textAlign: 'center', fontSize: 28, fontWeight: '900', letterSpacing: 12, marginBottom: 4, marginTop: 4 },
    resendRow: { marginTop: 12, alignItems: 'center' },
    resendText: { color: colors.purpleLight, fontWeight: '700', fontSize: 13 },

    // (legacy, kept for compat)
    backBtn: { marginBottom: 14 },
    backText: { color: colors.purpleLight, fontWeight: '700', fontSize: 14 },

    legalText: { color: colors.textSecondary, fontSize: 13, lineHeight: 22, paddingTop: 13 },

    // Country picker
    pickerOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
    pickerBox: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 27 },
    pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: colors.border },
    pickerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
    pickerClose: { color: colors.textMuted, fontSize: 18, fontWeight: '700' },
    pickerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 17, paddingVertical: 11, borderBottomWidth: 1, borderColor: colors.border + '44' },
    pickerItemActive: { backgroundColor: colors.purple + '18' },
    pickerItemText: { color: colors.text, fontSize: 15 },
    pickerItemTextActive: { color: colors.purpleLight, fontWeight: '700' },
});
