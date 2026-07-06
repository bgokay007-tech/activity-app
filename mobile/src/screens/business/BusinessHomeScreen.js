import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    StatusBar, Platform, Alert, ActivityIndicator, Modal, Image,
    TextInput, Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../store/slices/authSlice';
import api from '../../services/api';
import colors from '../../theme/colors';

const BIZ_COLOR = '#f59e0b';
const BIZ_LIGHT = '#fbbf24';
const BIZ_DIM   = '#f59e0b18';

const EFT_BANK = {
    banka:    'Ziraat Bankası',
    iban:     'TR00 0000 0000 0000 0000 0000 00',
    sahip:    'AcTiViTy Teknoloji Ltd. Şti.',
};

const PACKAGES = [
    {
        key: 'STARTER', icon: '🏅', name: 'Başlangıç Paketi', price: '399',
        features: [
            'Turnuva oluşturma yetkisi',
            'Kortlarını turnuvaya ekleme',
            'Turnuva maçlarına kort atama',
        ],
    },
    {
        key: 'RAHATLATICI', icon: '🌿', name: 'Rahatlatıcı Paket', price: '999',
        features: [
            'Turnuva oluşturma yetkisi',
            'Kortlarını turnuvaya ekleme',
            'Turnuva maçlarına kort atama',
            'Tesis & kort ekleme (max 3 tesis)',
            'Uygulama üzerinden online rezervasyon',
            'Telefon trafiği iş yükü kalkar',
        ],
    },
    {
        key: 'PRO', icon: '🚀', name: 'Pro Paket', price: '1999',
        features: [
            'Turnuva oluşturma yetkisi',
            'Kortlarını turnuvaya ekleme',
            'Turnuva maçlarına kort atama',
            'Tesis & kort ekleme (sınırsız tesis)',
            'Uygulama üzerinden online rezervasyon',
            'Telefon trafiği iş yükü kalkar',
            'Öncelikli destek',
            'Ekstra hizmet menüsü (raket, su, havlu vb.)',
            'Kullanıcı engelleme özelliği',
            'Doluluk & gelir raporlama — günlük/haftalık/aylık dönemler, en yoğun saatler ve günler, tahmini gelir özeti',
            'Resmi tatil & dini bayram hatırlatıcısı — tatilden 1 ay önce başlar, 3 günde bir bildirim gelir; "Bu tarihte çalışıyor olacak mısınız? Saatlerinizi güncelleyin" şeklinde hatırlatır',
        ],
    },
    {
        key: 'PREMIUM', icon: '👑', name: 'Premium Paket', price: '3999',
        features: [
            'Turnuva oluşturma yetkisi',
            'Kortlarını turnuvaya ekleme',
            'Turnuva maçlarına kort atama',
            'Tesis & kort ekleme (sınırsız tesis)',
            'Uygulama üzerinden online rezervasyon',
            'Telefon trafiği iş yükü kalkar',
            'Öncelikli destek',
            'Gelişmiş istatistikler',
            'Özel marka sayfası',
            'API entegrasyonu',
            'Dedicated destek hattı',
            'Resmi tatil & dini bayram hatırlatıcısı — tatilden 1 ay önce başlar, 3 günde bir bildirim gelir; "Bu tarihte çalışıyor olacak mısınız? Saatlerinizi güncelleyin" şeklinde hatırlatır',
        ],
    },
];

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const SLOT_TYPES = [
    { key: 'FULL_HOUR',  label: 'Tam Saatler',     desc: '10:00-11:00, 11:00-12:00…' },
    { key: 'HALF_HOUR',  label: 'Buçuklu Saatler',  desc: '10:30-11:30, 11:30-12:30…' },
    { key: 'NINETY_MIN', label: '90 Dakika',         desc: '10:00-11:30 → 12:00-13:30 (30dk boşluk)' },
];
const STATUS_COLOR = { PENDING: '#eab308', APPROVED: '#22c55e', REJECTED: '#ef4444' };
const STATUS_LABEL = { PENDING: '⏳ Onay Bekliyor', APPROVED: '✅ Onaylandı', REJECTED: '❌ Reddedildi' };

// ── Abonelik Modalı ──────────────────────────────────────────────────────────
function SubscriptionModal({ visible, onClose, sub, pendingRequest, onPurchase, onCancel, cancelling, submitting, uploading, onUploadReceipt, username }) {
    const [step, setStep]           = useState('packages'); // packages | pay | eft
    const [selectedPkg, setSelected] = useState(null);

    const resetFlow = () => { setStep('packages'); setSelected(null); };
    const activePkg = PACKAGES.find(p => p.key === sub?.packageType);

    const handleEftConfirm = async () => {
        await onPurchase(selectedPkg.key);
        resetFlow();
    };

    const renderSubContent = () => {
        if (sub) {
            const endDate  = new Date(sub.endDate);
            const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
            return (
                <View style={m.activeCard}>
                    <View style={m.activeHeader}>
                        <Text style={m.activeIcon}>{activePkg?.icon || '✅'}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={m.activeTitle}>{activePkg?.name || sub.packageType} Aktif</Text>
                            <Text style={m.activeSub}>{daysLeft} gün kaldı · {endDate.toLocaleDateString('tr-TR')}</Text>
                        </View>
                        <View style={m.activeBadge}><Text style={m.activeBadgeText}>AKTİF</Text></View>
                    </View>
                    <View style={m.divider} />
                    {(activePkg?.features || []).map((f, i) => (
                        <View key={i} style={m.featureRow}>
                            <Text style={m.featureCheck}>✓</Text>
                            <Text style={m.featureText}>{f}</Text>
                        </View>
                    ))}
                    <TouchableOpacity style={m.cancelBtn} onPress={onCancel} disabled={cancelling} activeOpacity={0.8}>
                        {cancelling ? <ActivityIndicator size="small" color="#f87171" /> : <Text style={m.cancelBtnText}>Aboneliği İptal Et</Text>}
                    </TouchableOpacity>
                </View>
            );
        }
        if (pendingRequest) {
            return (
                <View style={m.pendingCard}>
                    <Text style={m.pendingIcon}>⏳</Text>
                    <Text style={m.pendingTitle}>Onay Bekleniyor</Text>
                    <Text style={m.pendingDesc}>
                        Ödeme bildiriminiz alındı. Admin onayladığında paketiniz aktif edilecek.{'\n\n'}
                        Talep tarihi: {new Date(pendingRequest.createdAt).toLocaleDateString('tr-TR')}
                    </Text>
                    {pendingRequest.receiptUrl ? (
                        <>
                            <Text style={m.receiptLabel}>📎 Yüklenen Dekont</Text>
                            <Image source={{ uri: pendingRequest.receiptUrl }} style={m.receiptThumb} resizeMode="cover" />
                        </>
                    ) : (
                        <>
                            <Text style={m.receiptHint}>📅 Dekontunuzu 24 saat içinde yükleyebilirsiniz (zorunlu değil)</Text>
                            <TouchableOpacity style={[m.uploadBtn, uploading && { opacity: 0.6 }]} onPress={onUploadReceipt} disabled={uploading} activeOpacity={0.8}>
                                {uploading ? <ActivityIndicator size="small" color="#000" /> : <Text style={m.uploadBtnText}>📎 Dekont Yükle</Text>}
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            );
        }
        // Paket seçimi
        if (step === 'packages') {
            return (
                <View>
                    <Text style={m.pkgSelectTitle}>Bir paket seçin</Text>
                    {PACKAGES.map(pkg => (
                        <TouchableOpacity key={pkg.key} style={[m.pkgSelectCard, selectedPkg?.key === pkg.key && m.pkgSelectCardActive]}
                            onPress={() => setSelected(pkg)} activeOpacity={0.8}>
                            <View style={m.pkgSelectRow}>
                                <Text style={m.pkgIcon}>{pkg.icon}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={m.pkgName}>{pkg.name}</Text>
                                    <Text style={m.pkgSelectPrice}>{pkg.price}₺/ay</Text>
                                </View>
                                {selectedPkg?.key === pkg.key && <Text style={m.pkgSelectCheck}>✓</Text>}
                            </View>
                            {selectedPkg?.key === pkg.key && pkg.features.map((f, i) => (
                                <View key={i} style={m.featureRow}>
                                    <Text style={m.featureCheck}>✓</Text>
                                    <Text style={m.featureText}>{f}</Text>
                                </View>
                            ))}
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={[m.pkgContinueBtn, !selectedPkg && { opacity: 0.4 }]}
                        onPress={() => setStep('pay')} disabled={!selectedPkg} activeOpacity={0.8}>
                        <Text style={m.pkgContinueBtnText}>Devam Et →</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        // Ödeme yöntemi
        if (step === 'pay') {
            return (
                <View style={m.pkgCard}>
                    <TouchableOpacity onPress={resetFlow} style={m.backRow}>
                        <Text style={m.backArrow}>‹</Text>
                        <Text style={m.backLabel}>Paket Seçimi</Text>
                    </TouchableOpacity>
                    <Text style={m.pkgIcon}>{selectedPkg.icon}</Text>
                    <Text style={m.pkgName}>{selectedPkg.name}</Text>
                    <View style={m.pkgPriceRow}>
                        <Text style={m.pkgPrice}>{selectedPkg.price}₺</Text>
                        <Text style={m.pkgPeriod}>/ay</Text>
                    </View>
                    <View style={m.divider} />
                    <Text style={m.payTitle}>Ödeme Yöntemi Seç</Text>
                    <View style={m.payOptionDisabled}>
                        <View style={m.optionLeft}><Text style={m.payIcon}>💳</Text><View><Text style={m.payLabelOff}>Online Ödeme</Text><Text style={m.payDesc}>Kredi / banka kartı</Text></View></View>
                        <View style={m.soonBadge}><Text style={m.soonText}>Yakında</Text></View>
                    </View>
                    <TouchableOpacity style={m.payOption} onPress={() => setStep('eft')} activeOpacity={0.8}>
                        <View style={m.optionLeft}><Text style={m.payIcon}>🏦</Text><View><Text style={m.payLabel}>EFT / Havale</Text><Text style={m.payDesc}>Banka transferi</Text></View></View>
                        <Text style={m.arrow}>›</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        // EFT adımı
        return (
            <View style={m.pkgCard}>
                <TouchableOpacity onPress={() => setStep('pay')} style={m.backRow}>
                    <Text style={m.backArrow}>‹</Text>
                    <Text style={m.backLabel}>Geri</Text>
                </TouchableOpacity>
                <Text style={m.pkgName}>EFT / Havale Bilgileri</Text>
                <View style={m.infoBox}>
                    {[
                        { label: 'Banka', value: EFT_BANK.banka },
                        { label: 'IBAN', value: EFT_BANK.iban },
                        { label: 'Hesap Sahibi', value: EFT_BANK.sahip },
                        { label: 'Tutar', value: `${selectedPkg?.price || '?'},00 TL` },
                        { label: 'Açıklama', value: `${selectedPkg?.name || ''} – ${username || ''}` },
                    ].map(row => (
                        <View key={row.label} style={m.infoRow}>
                            <Text style={m.infoLabel}>{row.label}</Text>
                            <Text style={m.infoValue} selectable>{row.value}</Text>
                        </View>
                    ))}
                </View>
                <View style={m.noteBox}>
                    <Text style={m.noteText}>✅  Açıklamaya kullanıcı adınızı yazmayı unutmayın.{'\n\n'}📎  Ödemeyi yaptıktan sonra onay isteği gönderin. Dekontunuzu 24 saat içinde yükleyebilirsiniz.</Text>
                </View>
                <View style={m.eftBtnRow}>
                    <TouchableOpacity style={m.laterBtn} onPress={() => setStep('pay')} activeOpacity={0.8}>
                        <Text style={m.laterBtnText}>Belki Daha Sonra</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[m.doneBtn, submitting && { opacity: 0.6 }]} onPress={handleEftConfirm} disabled={submitting} activeOpacity={0.8}>
                        {submitting ? <ActivityIndicator size="small" color="#000" /> : <Text style={m.doneBtnText}>Tamam, Ödemeyi Yapıyorum →</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={ms.overlay}>
                <View style={ms.sheet}>
                    <View style={ms.handle} />
                    <View style={ms.subHeader}>
                        <Text style={ms.subTitle}>📋 Abonelikler</Text>
                        <TouchableOpacity onPress={onClose}><Text style={ms.closeBtn}>✕</Text></TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                        {renderSubContent()}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ── Tesis Ekleme Modalı (3 adım) ─────────────────────────────────────────────
function VenueAddModal({ visible, onClose, onSuccess }) {
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: '', branch: '', city: '', district: '', address: '', phone: '',
        openTime: '08:00', closeTime: '22:00',
        openDays: [1, 2, 3, 4, 5, 6, 7],
        slotType: 'FULL_HOUR',
        pricePerSlot: '',
        courts: ['Kort 1'],
    });

    const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

    const toggleDay = (d) => {
        set('openDays', form.openDays.includes(d) ? form.openDays.filter(x => x !== d) : [...form.openDays, d].sort((a, b) => a - b));
    };

    const addCourt = () => {
        const next = form.courts.length + 1;
        set('courts', [...form.courts, `Kort ${next}`]);
    };

    const updateCourt = (i, val) => {
        const arr = [...form.courts]; arr[i] = val; set('courts', arr);
    };

    const removeCourt = (i) => {
        if (form.courts.length <= 1) return;
        set('courts', form.courts.filter((_, idx) => idx !== i));
    };

    const handleClose = () => {
        setStep(1);
        setForm({ name: '', branch: '', city: '', district: '', address: '', phone: '', openTime: '08:00', closeTime: '22:00', openDays: [1,2,3,4,5,6,7], slotType: 'FULL_HOUR', pricePerSlot: '', courts: ['Kort 1'] });
        onClose();
    };

    const handleSubmit = async () => {
        const filled = form.courts.filter(c => c.trim());
        if (!filled.length) { Alert.alert('Hata', 'En az bir kort giriniz'); return; }
        setSaving(true);
        try {
            await api.post('/venues', { ...form, courts: filled });
            Alert.alert('✅ Gönderildi', 'Tesis başvurunuz alındı. Admin onayından sonra yayınlanacak.');
            handleClose();
            onSuccess?.();
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi');
        } finally { setSaving(false); }
    };

    const renderStep = () => {
        if (step === 1) return (
            <View>
                <Text style={va.stepTitle}>Adım 1 / 3 — Tesis Bilgileri</Text>
                <TextInput style={va.input} placeholder="Tesis / İşletme Adı *" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={v => set('name', v)} />
                <TextInput style={va.input} placeholder="Spor Dalı (ör. tenis, futbol) *" placeholderTextColor={colors.textMuted} value={form.branch} onChangeText={v => set('branch', v)} />
                <TextInput style={va.input} placeholder="Şehir *" placeholderTextColor={colors.textMuted} value={form.city} onChangeText={v => set('city', v)} />
                <TextInput style={va.input} placeholder="İlçe (isteğe bağlı)" placeholderTextColor={colors.textMuted} value={form.district} onChangeText={v => set('district', v)} />
                <TextInput style={va.input} placeholder="Adres" placeholderTextColor={colors.textMuted} value={form.address} onChangeText={v => set('address', v)} />
                <TextInput style={va.input} placeholder="Telefon" placeholderTextColor={colors.textMuted} value={form.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" />
                <TouchableOpacity style={[va.nextBtn, (!form.name || !form.branch || !form.city) && { opacity: 0.4 }]} onPress={() => setStep(2)} disabled={!form.name || !form.branch || !form.city} activeOpacity={0.8}>
                    <Text style={va.nextBtnText}>İleri →</Text>
                </TouchableOpacity>
            </View>
        );

        if (step === 2) return (
            <View>
                <Text style={va.stepTitle}>Adım 2 / 3 — Saatler & Rezervasyon Tipi</Text>

                <Text style={va.label}>Açık Saatler</Text>
                <View style={va.timeRow}>
                    <View style={va.timeBox}>
                        <Text style={va.timeLabel}>Açılış</Text>
                        <TextInput style={va.timeInput} placeholder="08:00" placeholderTextColor={colors.textMuted} value={form.openTime} onChangeText={v => set('openTime', v)} />
                    </View>
                    <Text style={va.timeSep}>–</Text>
                    <View style={va.timeBox}>
                        <Text style={va.timeLabel}>Kapanış</Text>
                        <TextInput style={va.timeInput} placeholder="22:00" placeholderTextColor={colors.textMuted} value={form.closeTime} onChangeText={v => set('closeTime', v)} />
                    </View>
                </View>

                <Text style={va.label}>Açık Günler</Text>
                <View style={va.daysRow}>
                    {DAYS.map((d, i) => {
                        const num = i + 1;
                        const active = form.openDays.includes(num);
                        return (
                            <TouchableOpacity key={d} style={[va.dayBtn, active && va.dayBtnActive]} onPress={() => toggleDay(num)} activeOpacity={0.7}>
                                <Text style={[va.dayBtnText, active && va.dayBtnTextActive]}>{d}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <Text style={va.label}>Rezervasyon Tipi</Text>
                {SLOT_TYPES.map(st => (
                    <TouchableOpacity key={st.key} style={[va.slotBtn, form.slotType === st.key && va.slotBtnActive]} onPress={() => set('slotType', st.key)} activeOpacity={0.8}>
                        <View style={{ flex: 1 }}>
                            <Text style={[va.slotBtnLabel, form.slotType === st.key && { color: '#000' }]}>{st.label}</Text>
                            <Text style={[va.slotBtnDesc, form.slotType === st.key && { color: '#00000099' }]}>{st.desc}</Text>
                        </View>
                        {form.slotType === st.key && <Text style={va.slotCheck}>✓</Text>}
                    </TouchableOpacity>
                ))}

                <Text style={va.label}>Slot Başı Ücret (₺)</Text>
                <TextInput style={va.input} placeholder="0 (ücretsiz ise boş bırakın)" placeholderTextColor={colors.textMuted} value={form.pricePerSlot} onChangeText={v => set('pricePerSlot', v)} keyboardType="numeric" />

                <View style={va.rowBtns}>
                    <TouchableOpacity style={va.backBtn} onPress={() => setStep(1)} activeOpacity={0.8}>
                        <Text style={va.backBtnText}>‹ Geri</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={va.nextBtn2} onPress={() => setStep(3)} activeOpacity={0.8}>
                        <Text style={va.nextBtnText}>İleri →</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );

        // Step 3: Kortlar
        return (
            <View>
                <Text style={va.stepTitle}>Adım 3 / 3 — Kortlar / Sahalar</Text>
                <Text style={va.hint}>Her kortu numarayla (1, 2…) veya harfle (A, B…) adlandırın.</Text>
                {form.courts.map((c, i) => (
                    <View key={i} style={va.courtRow}>
                        <TextInput
                            style={va.courtInput}
                            placeholder={`Kort ${i + 1}`}
                            placeholderTextColor={colors.textMuted}
                            value={c}
                            onChangeText={v => updateCourt(i, v)}
                        />
                        {form.courts.length > 1 && (
                            <TouchableOpacity onPress={() => removeCourt(i)} style={va.removeBtn}>
                                <Text style={va.removeBtnText}>✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ))}
                <TouchableOpacity style={va.addCourtBtn} onPress={addCourt} activeOpacity={0.8}>
                    <Text style={va.addCourtBtnText}>+ Kort Ekle</Text>
                </TouchableOpacity>

                <View style={va.rowBtns}>
                    <TouchableOpacity style={va.backBtn} onPress={() => setStep(2)} activeOpacity={0.8}>
                        <Text style={va.backBtnText}>‹ Geri</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[va.nextBtn2, saving && { opacity: 0.6 }]} onPress={handleSubmit} disabled={saving} activeOpacity={0.8}>
                        {saving ? <ActivityIndicator size="small" color="#000" /> : <Text style={va.nextBtnText}>Gönder ✓</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
            <View style={ms.overlay}>
                <View style={[ms.sheet, { maxHeight: '92%' }]}>
                    <View style={ms.handle} />
                    <View style={ms.subHeader}>
                        <Text style={ms.subTitle}>🏟️ Tesis / Kort Ekle</Text>
                        <TouchableOpacity onPress={handleClose}><Text style={ms.closeBtn}>✕</Text></TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
                        {renderStep()}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ── IBAN Kartı ────────────────────────────────────────────────────────────────
function IbanCard({ iban, ibanHolder, onSave }) {
    const [editing, setEditing] = useState(false);
    const [ibanVal, setIbanVal]     = useState(iban       || '');
    const [holderVal, setHolderVal] = useState(ibanHolder || '');
    const [saving, setSaving] = useState(false);

    const handleEdit = () => {
        setIbanVal(iban || '');
        setHolderVal(ibanHolder || '');
        setEditing(true);
    };

    const handleSave = async () => {
        if (!holderVal.trim()) { Alert.alert('Hata', 'Hesap sahibi adını giriniz'); return; }
        if (!ibanVal.trim())   { Alert.alert('Hata', 'IBAN giriniz'); return; }
        setSaving(true);
        try {
            await onSave(ibanVal.trim(), holderVal.trim());
            setEditing(false);
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || e?.message || 'IBAN kaydedilemedi'); }
        finally { setSaving(false); }
    };

    const hasData = iban && ibanHolder;

    return (
        <View style={ic.card}>
            <View style={ic.row}>
                <Text style={ic.title}>🏦 Ödeme IBAN Bilgileri</Text>
                {!editing && (
                    <TouchableOpacity onPress={handleEdit}>
                        <Text style={ic.editBtn}>{hasData ? 'Düzenle' : 'Ekle'}</Text>
                    </TouchableOpacity>
                )}
            </View>
            {editing ? (
                <>
                    <Text style={ic.fieldLabel}>Hesap Sahibi Adı</Text>
                    <TextInput
                        style={ic.input}
                        placeholder="İşletme adı veya ad soyad"
                        placeholderTextColor={colors.textMuted}
                        value={holderVal}
                        onChangeText={setHolderVal}
                    />
                    <Text style={ic.fieldLabel}>IBAN</Text>
                    <TextInput
                        style={ic.input}
                        placeholder="TR00 0000 0000 0000 0000 0000 00"
                        placeholderTextColor={colors.textMuted}
                        value={ibanVal}
                        onChangeText={setIbanVal}
                        autoCapitalize="characters"
                    />
                    <View style={ic.btns}>
                        <TouchableOpacity onPress={() => setEditing(false)} style={ic.cancelBtn}>
                            <Text style={ic.cancelBtnText}>Vazgeç</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleSave} disabled={saving} style={ic.saveBtn}>
                            {saving ? <ActivityIndicator size="small" color="#000" /> : <Text style={ic.saveBtnText}>Kaydet</Text>}
                        </TouchableOpacity>
                    </View>
                </>
            ) : hasData ? (
                <>
                    <View style={ic.dataRow}>
                        <Text style={ic.dataLabel}>Hesap Sahibi</Text>
                        <Text style={ic.dataValue}>{ibanHolder}</Text>
                    </View>
                    <View style={ic.dataRow}>
                        <Text style={ic.dataLabel}>IBAN</Text>
                        <Text style={ic.dataValueMono} selectable>{iban}</Text>
                    </View>
                </>
            ) : (
                <Text style={ic.empty}>IBAN bilgisi eklenmemiş</Text>
            )}
            <Text style={ic.hint}>Müşterilerin EFT ile ödeme yapabilmesi için IBAN ve hesap sahibi adı gereklidir.</Text>
        </View>
    );
}

// ── Venue Analytics Modal ─────────────────────────────────────────────────────

const ld = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const PRESETS = [
    { key: 'today',  label: 'Bugün',    getDates: () => { const t = ld(new Date()); return [t, t]; } },
    { key: 'week',   label: 'Bu Hafta', getDates: () => {
        const now = new Date();
        const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay()+6)%7));
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        return [ld(mon), ld(sun)];
    }},
    { key: 'month',  label: 'Bu Ay',   getDates: () => {
        const now = new Date();
        return [ld(new Date(now.getFullYear(), now.getMonth(), 1)), ld(new Date(now.getFullYear(), now.getMonth()+1, 0))];
    }},
    { key: 'custom', label: 'Özel',    getDates: () => [null, null] },
];

function Bar({ value, max, color }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <View style={{ height: 8, backgroundColor: '#ffffff10', borderRadius: 4, overflow: 'hidden', flex: 1 }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
        </View>
    );
}

function VenueAnalyticsModal({ visible, venue, onClose }) {
    const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const [preset, setPreset]     = useState('week');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate]     = useState('');
    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(false);

    const fetchReport = (from, to) => {
        if (!from || !to || !venue?.id) return;
        setLoading(true);
        setData(null);
        api.get(`/venues/${venue.id}/analytics?from=${from}&to=${to}`)
            .then(r => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    };

    const selectPreset = (key) => {
        setPreset(key);
        if (key === 'custom') return;
        const [f, t] = PRESETS.find(p => p.key === key).getDates();
        setFromDate(f); setToDate(t);
        fetchReport(f, t);
    };

    useEffect(() => {
        if (visible) selectPreset('today');
    }, [visible, venue?.id]);

    const maxHour = Math.max(1, ...(data?.busyHours?.map(h => h.count) || [1]));
    const maxDay  = Math.max(1, ...(data?.busyDays?.map(d => d.count)  || [1]));

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: '#0a0a14' }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                    paddingTop: Platform.OS === 'ios' ? 54 : 28, paddingBottom: 14,
                    borderBottomWidth: 1, borderBottomColor: '#ffffff12' }}>
                    <TouchableOpacity onPress={onClose} style={{ marginRight: 14, padding: 4 }}>
                        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '300' }}>←</Text>
                    </TouchableOpacity>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                        {venue?.name} — Doluluk Raporu
                    </Text>
                </View>

                {/* Preset buttons */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    style={{ paddingHorizontal: 14, paddingVertical: 10, maxHeight: 52, borderBottomWidth: 1, borderBottomColor: '#ffffff08' }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {PRESETS.map(p => (
                            <TouchableOpacity key={p.key}
                                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
                                    borderColor: preset === p.key ? BIZ_COLOR + '70' : '#ffffff20',
                                    backgroundColor: preset === p.key ? BIZ_COLOR + '18' : '#ffffff07' }}
                                onPress={() => selectPreset(p.key)}>
                                <Text style={{ color: preset === p.key ? BIZ_LIGHT : '#888', fontSize: 13, fontWeight: '600' }}>
                                    {p.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>

                {/* Custom date inputs */}
                {preset === 'custom' && (
                    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 10,
                        borderBottomWidth: 1, borderBottomColor: '#ffffff08', alignItems: 'center' }}>
                        <TextInput style={{ flex: 1, backgroundColor: '#ffffff0c', borderRadius: 8, padding: 9,
                            color: '#fff', fontSize: 13, borderWidth: 1, borderColor: '#ffffff18' }}
                            placeholder="Başlangıç  YYYY-AA-GG" placeholderTextColor="#555"
                            value={fromDate} onChangeText={setFromDate} />
                        <Text style={{ color: '#666' }}>–</Text>
                        <TextInput style={{ flex: 1, backgroundColor: '#ffffff0c', borderRadius: 8, padding: 9,
                            color: '#fff', fontSize: 13, borderWidth: 1, borderColor: '#ffffff18' }}
                            placeholder="Bitiş  YYYY-AA-GG" placeholderTextColor="#555"
                            value={toDate} onChangeText={setToDate} />
                        <TouchableOpacity style={{ backgroundColor: BIZ_COLOR, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 }}
                            onPress={() => fetchReport(fromDate, toDate)}>
                            <Text style={{ color: '#000', fontWeight: '800', fontSize: 13 }}>Getir</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <ScrollView style={{ flex: 1, padding: 16 }} showsVerticalScrollIndicator={false}>
                    {loading && <ActivityIndicator color={BIZ_COLOR} style={{ marginTop: 40 }} />}

                    {data && (
                        <>
                            {/* KPI cards */}
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
                                <View style={{ flex: 1, backgroundColor: '#ffffff08', borderRadius: 12, padding: 14,
                                    borderWidth: 1, borderColor: BIZ_COLOR + '40', alignItems: 'center' }}>
                                    <Text style={{ color: BIZ_LIGHT, fontSize: 28, fontWeight: '900' }}>{Number(data.occupancyRate).toFixed(1)}%</Text>
                                    <Text style={{ color: '#888', fontSize: 11, marginTop: 3, textAlign: 'center' }}>Doluluk Oranı</Text>
                                </View>
                                <View style={{ flex: 1, gap: 8 }}>
                                    <View style={{ backgroundColor: '#ffffff08', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#ffffff12' }}>
                                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{data.totalBooked}</Text>
                                        <Text style={{ color: '#888', fontSize: 11 }}>Toplam Rezervasyon</Text>
                                    </View>
                                    {data.totalRevenue > 0 && (
                                        <View style={{ backgroundColor: '#ffffff08', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#22c55e30' }}>
                                            <Text style={{ color: '#22c55e', fontSize: 18, fontWeight: '800' }}>{data.totalRevenue}₺</Text>
                                            <Text style={{ color: '#888', fontSize: 11 }}>Tahmini Gelir</Text>
                                        </View>
                                    )}
                                </View>
                            </View>

                            {/* Busiest hours */}
                            {data.busyHours?.length > 0 && (
                                <View style={{ backgroundColor: '#ffffff06', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#ffffff0f' }}>
                                    <Text style={{ color: BIZ_LIGHT, fontSize: 13, fontWeight: '800', marginBottom: 12 }}>⏰ Saat Bazında Yoğunluk</Text>
                                    {data.busyHours.slice(0, 8).map((h, i) => (
                                        <View key={h.hour} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 }}>
                                            <Text style={{ color: '#ddd', fontSize: 12, fontWeight: '700', width: 44 }}>{h.hour}</Text>
                                            <Bar value={h.count} max={maxHour} color={i === 0 ? BIZ_COLOR : '#f59e0b80'} />
                                            <Text style={{ color: '#aaa', fontSize: 12, width: 28, textAlign: 'right' }}>{h.count}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Busiest days of week */}
                            {data.busyDays?.length > 0 && (
                                <View style={{ backgroundColor: '#ffffff06', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#ffffff0f' }}>
                                    <Text style={{ color: BIZ_LIGHT, fontSize: 13, fontWeight: '800', marginBottom: 12 }}>📅 Gün Bazında Yoğunluk</Text>
                                    {data.busyDays.map((d, i) => (
                                        <View key={d.day} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 }}>
                                            <Text style={{ color: '#ddd', fontSize: 12, fontWeight: '700', width: 76 }}>{d.day}</Text>
                                            <Bar value={d.count} max={maxDay} color={i === 0 ? '#60a5fa' : '#3b82f660'} />
                                            <Text style={{ color: '#aaa', fontSize: 12, width: 28, textAlign: 'right' }}>{d.count}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Daily breakdown */}
                            {data.daily?.length > 0 && (
                                <View style={{ backgroundColor: '#ffffff06', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#ffffff0f' }}>
                                    <Text style={{ color: BIZ_LIGHT, fontSize: 13, fontWeight: '800', marginBottom: 12 }}>📆 Günlük Dağılım</Text>
                                    {data.daily.map(d => (
                                        <View key={d.date} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 10 }}>
                                            <Text style={{ color: '#aaa', fontSize: 12, width: 90 }}>{d.date}</Text>
                                            <Bar value={d.count} max={Math.max(...data.daily.map(x => x.count))} color='#8b5cf6' />
                                            <Text style={{ color: '#aaa', fontSize: 12, width: 28, textAlign: 'right' }}>{d.count}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {data.totalBooked === 0 && (
                                <Text style={{ color: '#555', textAlign: 'center', marginTop: 32, fontSize: 13 }}>
                                    Bu dönem için rezervasyon bulunamadı
                                </Text>
                            )}
                        </>
                    )}
                    <View style={{ height: 32 }} />
                </ScrollView>
            </View>
        </Modal>
    );
}

// ── Venue Schedule Modal ──────────────────────────────────────────────────────

const SLOT_STATUS_COLOR = { FREE: '#22c55e', PENDING: '#f59e0b', CONFIRMED: '#ef4444' };
const SLOT_STATUS_BG    = { FREE: '#22c55e12', PENDING: '#f59e0b12', CONFIRMED: '#ef444412' };
const SLOT_STATUS_LABEL = { FREE: 'Müsait', PENDING: '⏳ Onay Bekliyor', CONFIRMED: 'Rezerveli' };

const SURFACE_LABEL = {
    CLAY:      'Toprak',
    HARD:      'Sert Zemin',
    CARPET:    'Halı Saha',
    GRASS:     'Çim',
    PARQUET:   'Parke',
    SYNTHETIC: 'Sentetik',
};
const SURFACE_ICON = {
    CLAY: '🟤', HARD: '🩶', CARPET: '🟥', GRASS: '🟢', PARQUET: '🟫', SYNTHETIC: '🟩',
};

const SCHED_COURT_W = 72;

// 00:00 → 24:00 arası 30'ar dakikalık seçenekler
const TIME_OPTIONS = Array.from({ length: 49 }, (_, i) => {
    const h = Math.floor((i * 30) / 60);
    const m = (i * 30) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

function normalizeTime(raw) {
    const t = raw.trim().replace(',', '.');
    if (/^\d{1,2}$/.test(t))      return `${t.padStart(2, '0')}:00`;
    if (/^\d{3,4}$/.test(t)) {
        const h = t.slice(0, t.length - 2).padStart(2, '0');
        const m = t.slice(-2).padStart(2, '0');
        return `${h}:${m}`;
    }
    if (/^\d{1,2}:\d{1,2}$/.test(t)) {
        const [h, m] = t.split(':');
        return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    }
    return t;
}

function isValidTimeStr(t) {
    const n = normalizeTime(t);
    return /^\d{2}:\d{2}$/.test(n)
        && parseInt(n.slice(0, 2)) <= 24
        && parseInt(n.slice(3)) < 60;
}

function TimePickerModal({ visible, value, onSelect, onClose }) {
    const [manual, setManual] = useState(value || '');
    useEffect(() => { setManual(value || ''); }, [value, visible]);

    const handleManualSubmit = () => {
        const n = normalizeTime(manual);
        if (!isValidTimeStr(n)) { Alert.alert('Hata', 'Geçerli saat girin (örn: 8, 8:30, 08:00)'); return; }
        onSelect(n);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: '#12121e', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' }}>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16,
                        borderBottomWidth: 1, borderBottomColor: '#ffffff12' }}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, flex: 1 }}>Saat Seç</Text>
                        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                            <Text style={{ color: '#aaa', fontSize: 20 }}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    {/* Manuel giriş */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ffffff08' }}>
                        <TextInput
                            style={{ flex: 1, backgroundColor: '#ffffff10', borderRadius: 8, paddingHorizontal: 12,
                                paddingVertical: 8, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#ffffff20' }}
                            placeholder="Manuel gir: 8, 8:30, 08:00…"
                            placeholderTextColor="#555"
                            value={manual}
                            onChangeText={setManual}
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                            returnKeyType="done"
                            onSubmitEditing={handleManualSubmit}
                        />
                        <TouchableOpacity onPress={handleManualSubmit}
                            style={{ backgroundColor: BIZ_COLOR + '30', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
                            <Text style={{ color: BIZ_LIGHT, fontWeight: '700' }}>Tamam</Text>
                        </TouchableOpacity>
                    </View>
                    {/* 30dk'lık liste */}
                    <ScrollView keyboardShouldPersistTaps="always">
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 }}>
                            {TIME_OPTIONS.map(t => {
                                const isSelected = t === value;
                                return (
                                    <TouchableOpacity key={t}
                                        onPress={() => onSelect(t)}
                                        style={{
                                            paddingHorizontal: 14, paddingVertical: 8,
                                            borderRadius: 8, borderWidth: 1.5,
                                            borderColor: isSelected ? BIZ_COLOR : '#ffffff18',
                                            backgroundColor: isSelected ? BIZ_COLOR + '28' : '#ffffff08',
                                            minWidth: 70, alignItems: 'center',
                                        }}>
                                        <Text style={{ color: isSelected ? BIZ_LIGHT : '#ccc', fontWeight: isSelected ? '800' : '400', fontSize: 14 }}>
                                            {t}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <View style={{ height: 32 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function VenueScheduleModal({ visible, venue, onClose, onUserPress }) {
    const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const [selDate, setSelDate]   = useState(() => toDateStr(new Date()));
    const [schedule, setSchedule] = useState(null);
    const [loading, setLoading]   = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);

    const shiftDate = (n) => {
        const d = new Date(selDate + 'T12:00:00');
        d.setDate(d.getDate() + n);
        setSelDate(toDateStr(d));
    };
    const fmtDate = (str) => new Date(str + 'T12:00:00').toLocaleDateString('tr-TR',
        { weekday: 'long', day: 'numeric', month: 'long' });

    const handleSlotPress = (slot) => {
        if (slot.status !== 'PENDING' || !slot.reservationId) return;
        const payLabel = slot.paymentMethod === 'EFT' ? '🏦 EFT' : slot.paymentMethod === 'ONLINE' ? '💳 Online' : '💵 Nakit';
        Alert.alert(
            '⏳ Onay Bekliyor',
            `@${slot.user?.username || '?'}\n${slot.start}–${slot.end}  ${payLabel}`,
            [
                { text: 'Vazgeç', style: 'cancel' },
                { text: '✅ Onayla', onPress: () =>
                    api.patch(`/venues/reservations/${slot.reservationId}/status`, { action: 'confirm' })
                        .then(() => setRefreshTick(t => t + 1))
                        .catch(e => Alert.alert('Hata', e?.response?.data?.message || 'Onaylanamadı'))
                },
                { text: '❌ Reddet', style: 'destructive', onPress: () =>
                    api.patch(`/venues/reservations/${slot.reservationId}/status`, { action: 'reject' })
                        .then(() => setRefreshTick(t => t + 1))
                        .catch(e => Alert.alert('Hata', e?.response?.data?.message || 'Reddedilemedi'))
                },
            ]
        );
    };

    useEffect(() => {
        if (!visible || !venue?.id) return;
        setLoading(true);
        api.get(`/venues/${venue.id}/schedule?date=${selDate}`)
            .then(r => setSchedule(r.data))
            .catch(() => setSchedule(null))
            .finally(() => setLoading(false));
    }, [visible, venue?.id, selDate, refreshTick]);

    const courts = [...(schedule?.courts || [])].sort((a, b) => {
        const nA = parseInt(a.courtName?.match(/\d+/)?.[0] ?? '', 10);
        const nB = parseInt(b.courtName?.match(/\d+/)?.[0] ?? '', 10);
        if (!isNaN(nA) && !isNaN(nB) && nA !== nB) return nA - nB;
        return (a.courtName ?? '') < (b.courtName ?? '') ? -1 : (a.courtName ?? '') > (b.courtName ?? '') ? 1 : 0;
    });

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: '#0a0a14' }}>

                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                    paddingTop: Platform.OS === 'ios' ? 54 : 28, paddingBottom: 14,
                    borderBottomWidth: 1, borderBottomColor: '#ffffff12' }}>
                    <TouchableOpacity onPress={onClose} style={{ marginRight: 14, padding: 4 }}>
                        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '300' }}>←</Text>
                    </TouchableOpacity>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                        {venue?.name} — Rezervasyon Takvimi
                    </Text>
                </View>

                {/* Date nav */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    paddingVertical: 8, gap: 16, borderBottomWidth: 1, borderBottomColor: '#ffffff08' }}>
                    <TouchableOpacity onPress={() => shiftDate(-1)} style={{ padding: 10 }}>
                        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700' }}>‹</Text>
                    </TouchableOpacity>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', minWidth: 190, textAlign: 'center' }}>
                        {fmtDate(selDate)}
                    </Text>
                    <TouchableOpacity onPress={() => shiftDate(1)} style={{ padding: 10 }}>
                        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700' }}>›</Text>
                    </TouchableOpacity>
                </View>

                {/* Legend */}
                <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingVertical: 8,
                    borderBottomWidth: 1, borderBottomColor: '#ffffff08' }}>
                    {[['FREE','Müsait'],['PENDING','Bekliyor'],['CONFIRMED','Rezerveli']].map(([s, lbl]) => (
                        <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: SLOT_STATUS_COLOR[s] }} />
                            <Text style={{ color: '#aaa', fontSize: 11 }}>{lbl}</Text>
                        </View>
                    ))}
                </View>

                {loading
                    ? <ActivityIndicator color={BIZ_COLOR} style={{ marginTop: 48 }} />
                    : courts.length === 0
                        ? <Text style={{ color:'#555', textAlign:'center', marginTop:40, fontSize:13 }}>Tesis bulunamadı</Text>
                        : (
                            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={true}
                                    contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 48 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                        {courts.map(court => (
                                            <View key={court.courtId} style={{ width: SCHED_COURT_W }}>
                                                {/* Court header */}
                                                <View style={{ backgroundColor: BIZ_COLOR + '22', borderRadius: 8,
                                                    paddingVertical: 7, paddingHorizontal: 6, marginBottom: 6, alignItems: 'center',
                                                    borderWidth: 1, borderColor: BIZ_COLOR + '44' }}>
                                                    <Text style={{ color: BIZ_LIGHT, fontWeight: '800', fontSize: 11, textAlign: 'center' }} numberOfLines={1}>
                                                        {court.courtName}
                                                    </Text>
                                                    {court.surface ? (
                                                        <Text style={{ color: '#aaa', fontSize: 9, marginTop: 2 }} numberOfLines={1}>
                                                            {SURFACE_ICON[court.surface]} {SURFACE_LABEL[court.surface]}
                                                        </Text>
                                                    ) : null}
                                                </View>

                                                {/* Slot cells */}
                                                {court.closed ? (
                                                    <View style={{ backgroundColor: '#ef444412', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ef444430' }}>
                                                        <Text style={{ fontSize: 14, marginBottom: 3 }}>🔒</Text>
                                                        <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700', textAlign: 'center' }}>Rezervasyona kapalı</Text>
                                                    </View>
                                                ) : court.slots.length === 0 ? (
                                                    <View style={{ backgroundColor: '#ffffff08', borderRadius: 8, padding: 10, alignItems: 'center' }}>
                                                        <Text style={{ color: '#555', fontSize: 11 }}>Slot yok</Text>
                                                    </View>
                                                ) : court.slots.map((slot, si) => {
                                                    const st = slot.status || 'FREE';
                                                    const color = SLOT_STATUS_COLOR[st];
                                                    const bg    = SLOT_STATUS_BG[st];
                                                    const isPending = st === 'PENDING' && slot.reservationId;
                                                    return (
                                                        <TouchableOpacity key={si}
                                                            onPress={() => isPending && handleSlotPress(slot)}
                                                            activeOpacity={isPending ? 0.7 : 1}
                                                            style={{
                                                                backgroundColor: bg,
                                                                borderRadius: 8, padding: 7, marginBottom: 5,
                                                                borderWidth: isPending ? 1.5 : 1,
                                                                borderColor: isPending ? color : color + '55',
                                                                minHeight: 48,
                                                            }}>
                                                            <Text style={{ color: color, fontSize: 11, fontWeight: '800' }}>
                                                                {slot.start}
                                                            </Text>
                                                            <Text style={{ color: color + 'aa', fontSize: 10, marginTop: 1 }}>
                                                                – {slot.end}
                                                            </Text>
                                                            {slot.user ? (
                                                                <TouchableOpacity onPress={() => onUserPress?.(slot.user)}>
                                                                    <Text style={{ color: '#60a5fa', fontSize: 10, marginTop: 4,
                                                                        fontWeight: '700', textDecorationLine: 'underline' }} numberOfLines={1}>
                                                                        @{slot.user.username}
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            ) : (
                                                                <Text style={{ color: color + '99', fontSize: 10, marginTop: 4 }}>
                                                                    {SLOT_STATUS_LABEL[st]}
                                                                </Text>
                                                            )}
                                                            {slot.price != null && (
                                                                <Text style={{ color: color + 'cc', fontSize: 9, marginTop: 3, fontWeight: '800' }}>
                                                                    {slot.price > 0 ? `${slot.price}₺` : 'Ücretsiz'}
                                                                </Text>
                                                            )}
                                                            {isPending && (
                                                                <Text style={{ color: color, fontSize: 9, marginTop: 2, fontWeight: '700' }}>
                                                                    Onayla / Reddet →
                                                                </Text>
                                                            )}
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        ))}
                                    </View>
                                </ScrollView>
                            </ScrollView>
                        )
                }
            </View>
        </Modal>
    );
}

// ── Tesis Kartı ────────────────────────────────────────────────────────────────
const MENU_CATS = [
    { key: 'EQUIPMENT', label: '🎾 Ekipman' },
    { key: 'FOOD',      label: '🍔 Yiyecek' },
    { key: 'DRINK',     label: '☕ İçecek' },
    { key: 'OTHER',     label: '📦 Diğer' },
];
const ORDER_COLORS = { PENDING:'#eab308', CONFIRMED:'#3b82f6', READY:'#22c55e', CANCELLED:'#ef4444' };
const ORDER_LABELS = { PENDING:'⏳ Bekliyor', CONFIRMED:'✅ Onaylandı', READY:'🟢 Hazır', CANCELLED:'❌ İptal' };

function VenueCard({ venue, sub, onDelete, navigation }) {
    const isApproved = venue.status === 'APPROVED';
    const isPro = sub && ['PRO', 'PREMIUM'].includes(sub.packageType);
    const [activeTab, setActiveTab] = useState('info');
    const [deleting, setDeleting]   = useState(false);

    const [blocks, setBlocks]             = useState([]);
    const [blockQ, setBlockQ]             = useState('');
    const [blocking, setBlocking]         = useState(false);
    const [blocksLoaded, setBlocksLoaded] = useState(false);

    const [menuItems, setMenuItems]   = useState([]);
    const [mName, setMName]           = useState('');
    const [mPrice, setMPrice]         = useState('');
    const [mCat, setMCat]             = useState('EQUIPMENT');
    const [addingItem, setAddingItem] = useState(false);
    const [menuLoaded, setMenuLoaded] = useState(false);

    const [orders, setOrders]             = useState([]);
    const [ordersLoaded, setOrdersLoaded] = useState(false);

    const [reservations, setReservations]   = useState([]);
    const [resLoaded, setResLoaded]         = useState(false);
    const [resFilter, setResFilter]         = useState('today'); // today | week | all
    const [scheduleOpen, setScheduleOpen]     = useState(false);
    const [analyticsOpen, setAnalyticsOpen]   = useState(false);
    const [courtSlotTypes, setCourtSlotTypes] = useState(() => {
        const VALID = ['FULL_HOUR', 'HALF_HOUR', 'NINETY_MIN', 'VAR_DURATION'];
        const init = {};
        (venue.courts || []).forEach(c => {
            init[c.id] = (VALID.includes(c.slotType) ? c.slotType : null) || venue.slotType || 'FULL_HOUR';
        });
        return init;
    });
    const [courtSurfaces, setCourtSurfaces] = useState(() => {
        const init = {};
        (venue.courts || []).forEach(c => { init[c.id] = c.surface || null; });
        return init;
    });
    const [venueLights, setVenueLights] = useState(
        () => (venue.courts || []).find(c => c.lightsFrom)?.lightsFrom || null
    );
    const [showVenueLightsPicker, setShowVenueLightsPicker] = useState(false);
    const [savingSlot, setSavingSlot]         = useState(false);
    const [expandedCourtId, setExpandedCourtId] = useState(null);

    // ── Fiyatlandırma state ───────────────────────────────────────────────────
    const [localPricingWindows, setLocalPricingWindows] = useState(
        () => Array.isArray(venue.pricingWindows) ? venue.pricingWindows : []
    );
    const [courtPrices, setCourtPrices] = useState(() => {
        const init = {};
        (venue.courts || []).forEach(c => { init[c.id] = c.pricePerSlot != null ? String(c.pricePerSlot) : ''; });
        return init;
    });
    const [addingPriceRule, setAddingPriceRule] = useState(false);
    const [newRuleFrom, setNewRuleFrom] = useState('');
    const [newRuleTo, setNewRuleTo]     = useState('');
    const [newRulePrice, setNewRulePrice] = useState('');
    const [newRuleCourtId, setNewRuleCourtId] = useState(null);
    const [savingPrice, setSavingPrice] = useState(false);
    const [showPriceFromPicker, setShowPriceFromPicker] = useState(false);
    const [showPriceToPicker, setShowPriceToPicker]     = useState(false);

    // ── Konum state ───────────────────────────────────────────────────────────
    const [localLat, setLocalLat] = useState(venue.lat != null ? String(venue.lat) : '');
    const [localLng, setLocalLng] = useState(venue.lng != null ? String(venue.lng) : '');
    const [savingLocation, setSavingLocation] = useState(false);

    // ── İletişim butonları state ──────────────────────────────────────────────
    const [localContactLinks, setLocalContactLinks] = useState(
        () => (venue.contactLinks && typeof venue.contactLinks === 'object') ? venue.contactLinks : {}
    );
    const [savingContactLinks, setSavingContactLinks] = useState(false);

    const sortedCourts = [...(venue.courts || [])].sort((a, b) => {
        const nA = parseInt(a.name.match(/\d+/)?.[0] ?? '', 10);
        const nB = parseInt(b.name.match(/\d+/)?.[0] ?? '', 10);
        if (!isNaN(nA) && !isNaN(nB) && nA !== nB) return nA - nB;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    const [selectedCourt, setSelectedCourt]   = useState(null); // null=tüm kortlar, string=courtId

    const [localOpenSlots, setLocalOpenSlots] = useState(() => {
        const os = venue.openSlots;
        if (os && !Array.isArray(os) && typeof os === 'object') return os;
        // Eski array format → tüm günlere uygula
        if (Array.isArray(os) && os.length > 0) {
            const obj = {};
            ['1','2','3','4','5','6','7'].forEach(d => { obj[d] = os.map(w => ({ from: w.from, to: w.to })); });
            return obj;
        }
        return {}; // boş = tüm günler varsayılan saatler
    });
    const [selectedDay,    setSelectedDay]    = useState(1); // 1=Pzt...7=Paz
    const [addingWindow,   setAddingWindow]   = useState(false);
    const [newFrom,        setNewFrom]        = useState('');
    const [newTo,          setNewTo]          = useState('');
    const [savingWindows,  setSavingWindows]  = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(null); // null | 'from' | 'to'

    const [localCancelPolicy,     setLocalCancelPolicy]     = useState(venue.cancelHoursBefore     ?? null);
    const [localReschedulePolicy, setLocalReschedulePolicy] = useState(venue.rescheduleHoursBefore ?? null);
    const [customPolicyHour,      setCustomPolicyHour]      = useState('');
    const [savingPolicy,          setSavingPolicy]          = useState(false);
    const [localAcceptedPayments, setLocalAcceptedPayments] = useState(
        Array.isArray(venue.acceptedPayments) ? venue.acceptedPayments : ['CASH', 'EFT']
    );
    const [savingPayments, setSavingPayments] = useState(false);

    const loadBlocks = async () => {
        try { const { data } = await api.get(`/venues/${venue.id}/blocked`); setBlocks(data); }
        catch {} finally { setBlocksLoaded(true); }
    };
    const loadMenu = async () => {
        try { const { data } = await api.get(`/venues/${venue.id}/menu`); setMenuItems(data.items || []); }
        catch {} finally { setMenuLoaded(true); }
    };
    const loadOrders = async () => {
        try { const { data } = await api.get(`/venues/${venue.id}/orders`); setOrders(data); }
        catch {} finally { setOrdersLoaded(true); }
    };
    const loadReservations = async () => {
        try { const { data } = await api.get(`/venues/${venue.id}/reservations`); setReservations(data); }
        catch {} finally { setResLoaded(true); }
    };

    const handleTab = (tab) => {
        setActiveTab(tab);
        if (tab === 'blocks'       && !blocksLoaded) loadBlocks();
        if (tab === 'menu'         && !menuLoaded)   loadMenu();
        if (tab === 'orders'       && !ordersLoaded) loadOrders();
        if (tab === 'reservations') { setScheduleOpen(true); if (!resLoaded) loadReservations(); }
        if (tab === 'analytics')    setAnalyticsOpen(true);
    };

    const handleBlock = async () => {
        if (!blockQ.trim()) return;
        setBlocking(true);
        try {
            const { data } = await api.post(`/venues/${venue.id}/block`, { username: blockQ.trim() });
            setBlocks(p => [{ ...data.block, user: data.user }, ...p]);
            setBlockQ('');
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Engellenemedi'); }
        finally { setBlocking(false); }
    };
    const handleUnblock = async (userId) => {
        try { await api.delete(`/venues/${venue.id}/block/${userId}`); setBlocks(p => p.filter(b => b.userId !== userId)); }
        catch {}
    };
    const handleAddItem = async () => {
        if (!mName.trim()) return;
        setAddingItem(true);
        try {
            const { data } = await api.post(`/venues/${venue.id}/menu`, { name: mName.trim(), price: mPrice, category: mCat });
            setMenuItems(p => [...p, data.item]);
            setMName(''); setMPrice(''); setMCat('EQUIPMENT');
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Eklenemedi'); }
        finally { setAddingItem(false); }
    };
    const toggleItem = async (item) => {
        try {
            const { data } = await api.patch(`/venues/${venue.id}/menu/${item.id}`, { available: !item.available });
            setMenuItems(p => p.map(m => m.id === item.id ? data.item : m));
        } catch {}
    };
    const deleteItem = async (itemId) => {
        try { await api.delete(`/venues/${venue.id}/menu/${itemId}`); setMenuItems(p => p.filter(m => m.id !== itemId)); }
        catch {}
    };
    const handleOrderStatus = async (orderId, status) => {
        try {
            await api.patch(`/venues/orders/${orderId}`, { status });
            setOrders(p => p.map(o => o.id === orderId ? { ...o, status } : o));
        } catch {}
    };

    const handleCancelReservation = async (resId) => {
        try {
            await api.delete(`/venues/reservations/${resId}`);
            setReservations(p => p.map(r => r.id === resId ? { ...r, status: 'CANCELLED' } : r));
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'İptal edilemedi'); }
    };

    const handleUpdateResStatus = async (resId, action) => {
        try {
            const { data } = await api.patch(`/venues/reservations/${resId}/status`, { action });
            setReservations(p => p.map(r => r.id === resId ? { ...r, status: data.reservation.status, noShow: data.reservation.noShow } : r));
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Güncellenemedi'); }
    };

    const handleTogglePayment = async (method) => {
        const next = localAcceptedPayments.includes(method)
            ? localAcceptedPayments.filter(m => m !== method)
            : [...localAcceptedPayments, method];
        if (next.length === 0) { Alert.alert('Uyarı', 'En az bir ödeme yöntemi seçili olmalı'); return; }
        setSavingPayments(true);
        try {
            await api.patch(`/venues/${venue.id}/settings`, { acceptedPayments: next });
            setLocalAcceptedPayments(next);
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi'); }
        finally { setSavingPayments(false); }
    };

    const handleUpdateCourtSlotType = async (courtId, type) => {
        if (courtSlotTypes[courtId] === type) return;
        setSavingSlot(true);
        try {
            await api.patch(`/venues/${venue.id}/courts/${courtId}/settings`, { slotType: type });
            setCourtSlotTypes(prev => ({ ...prev, [courtId]: type }));
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi'); }
        finally { setSavingSlot(false); }
    };

    const handleUpdateCourtSurface = async (courtId, surface) => {
        const next = courtSurfaces[courtId] === surface ? null : surface;
        try {
            await api.patch(`/venues/${venue.id}/courts/${courtId}/settings`, { surface: next });
            setCourtSurfaces(prev => ({ ...prev, [courtId]: next }));
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi'); }
    };

    const handleUpdateVenueLights = async (lightsFrom) => {
        try {
            await Promise.all(
                (venue.courts || []).map(c =>
                    api.patch(`/venues/${venue.id}/courts/${c.id}/settings`, { lightsFrom: lightsFrom || null })
                )
            );
            setVenueLights(lightsFrom || null);
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi'); }
    };

    const handleSaveCourtPrice = async (courtId) => {
        const raw = courtPrices[courtId];
        const p = raw === '' ? null : parseInt(raw);
        if (raw !== '' && (isNaN(p) || p < 0)) { Alert.alert('Hata', 'Geçerli bir fiyat giriniz'); return; }
        setSavingPrice(true);
        try {
            await api.patch(`/venues/${venue.id}/courts/${courtId}/settings`, { pricePerSlot: p });
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi'); }
        finally { setSavingPrice(false); }
    };

    const handleAddPricingRule = async () => {
        if (!newRuleFrom || !newRuleTo || newRulePrice === '') { Alert.alert('Hata', 'Saat aralığı ve fiyat giriniz'); return; }
        const price = parseInt(newRulePrice);
        if (isNaN(price) || price < 0) { Alert.alert('Hata', 'Geçerli fiyat giriniz'); return; }
        const rule = { from: newRuleFrom, to: newRuleTo, price, courtId: newRuleCourtId || null };
        const next = [...localPricingWindows, rule];
        setSavingPrice(true);
        try {
            await api.patch(`/venues/${venue.id}/settings`, { pricingWindows: next });
            setLocalPricingWindows(next);
            setAddingPriceRule(false);
            setNewRuleFrom(''); setNewRuleTo(''); setNewRulePrice(''); setNewRuleCourtId(null);
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi'); }
        finally { setSavingPrice(false); }
    };

    const handleDeletePricingRule = async (idx) => {
        const next = localPricingWindows.filter((_, i) => i !== idx);
        setSavingPrice(true);
        try {
            await api.patch(`/venues/${venue.id}/settings`, { pricingWindows: next });
            setLocalPricingWindows(next);
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi'); }
        finally { setSavingPrice(false); }
    };

    const handleSaveLocation = async () => {
        const lat = localLat.trim() ? parseFloat(localLat.trim().replace(',', '.')) : null;
        const lng = localLng.trim() ? parseFloat(localLng.trim().replace(',', '.')) : null;
        if ((localLat.trim() && isNaN(lat)) || (localLng.trim() && isNaN(lng))) {
            Alert.alert('Hata', 'Geçerli bir koordinat girin (örn. 41.0082)');
            return;
        }
        setSavingLocation(true);
        try {
            await api.patch(`/venues/${venue.id}/settings`, { lat, lng });
            Alert.alert('✅ Kaydedildi', 'Konum bilgisi güncellendi.');
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi'); }
        finally { setSavingLocation(false); }
    };

    const addCountryCode = (val) => {
        if (!val) return val;
        const v = val.trim();
        if (!v) return v;
        if (v.startsWith('+')) return v;
        if (v.startsWith('0')) return '+90' + v.slice(1);
        return '+90' + v;
    };

    const handleSaveContactLinks = async () => {
        setSavingContactLinks(true);
        try {
            const clean = {};
            if (localContactLinks.whatsapp?.trim())  clean.whatsapp  = addCountryCode(localContactLinks.whatsapp);
            if (localContactLinks.phone?.trim())     clean.phone     = addCountryCode(localContactLinks.phone);
            if (localContactLinks.telegram?.trim())  clean.telegram  = localContactLinks.telegram.trim();
            if (localContactLinks.instagram?.trim()) clean.instagram = localContactLinks.instagram.trim();
            if (localContactLinks.email?.trim())     clean.email     = localContactLinks.email.trim();
            await api.patch(`/venues/${venue.id}/settings`, { contactLinks: clean });
            setLocalContactLinks(clean);
            Alert.alert('✅ Kaydedildi', 'İletişim butonları güncellendi.');
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi'); }
        finally { setSavingContactLinks(false); }
    };

    const isValidTime = isValidTimeStr;

    const saveOpenSlots = async (slots) => {
        const prev = localOpenSlots;
        setLocalOpenSlots(slots);
        setSavingWindows(true);
        let lastErr;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
                await api.patch(`/venues/${venue.id}/settings`, { openSlots: slots });
                setSavingWindows(false);
                return;
            } catch (e) {
                lastErr = e;
                if (e.response) break; // HTTP hatası → retry yok
            }
        }
        setSavingWindows(false);
        setLocalOpenSlots(prev);
        const msg = lastErr?.response?.data?.message || lastErr?.message || 'Sunucuya ulaşılamadı, tekrar dene';
        Alert.alert('Kayıt Hatası', msg);
    };

    const dayKey          = String(selectedDay);
    const effectiveKey    = selectedCourt ? `${selectedCourt}_${dayKey}` : dayKey;
    const dayEntry        = localOpenSlots[effectiveKey]; // undefined | [] | [{from,to}...]
    const isClosed        = Array.isArray(dayEntry) && dayEntry.length === 0;
    const isCustomized    = Array.isArray(dayEntry) && dayEntry.length > 0;
    // Fallback: kort+gün → gün (kort modunda) → global şablon → tesis default
    const _dayOnlyEntry   = selectedCourt ? localOpenSlots[dayKey] : null;
    const _globalDef      = localOpenSlots['0'];
    const defaultWindows  =
        (Array.isArray(_dayOnlyEntry) && _dayOnlyEntry.length > 0) ? _dayOnlyEntry :
        (Array.isArray(_globalDef)    && _globalDef.length    > 0) ? _globalDef    :
        [{ from: venue.openTime || '08:00', to: venue.closeTime || '22:00' }];
    const dayWindows      = isCustomized ? dayEntry : [];
    const displayWindows  = isClosed ? [] : isCustomized ? dayWindows : defaultWindows;

    // Slot önizleme: verilen pencerelerden FULL_HOUR slotlarını hesapla
    const previewSlots = (windows) => {
        const toM = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const toT = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const expanded = [];
        for (const w of windows) {
            const o = toM(w.from), c = toM(w.to);
            if (c <= o) { if (o < 1440) expanded.push({ from: w.from, to: '24:00' }); if (c > 0) expanded.push({ from: '00:00', to: w.to }); }
            else expanded.push(w);
        }
        const slots = [];
        for (const w of expanded) {
            const o = toM(w.from), c = toM(w.to);
            for (let t = o; t + 60 <= c; t += 60) slots.push(`${toT(t)}–${toT(t + 60)}`);
        }
        return slots;
    };

    const handleRemoveWindow = (idx) => {
        if (!isCustomized) return;
        if (dayWindows.length <= 1) {
            const next = { ...localOpenSlots };
            delete next[effectiveKey];
            saveOpenSlots(next);
            return;
        }
        const next = { ...localOpenSlots, [effectiveKey]: dayWindows.filter((_, i) => i !== idx) };
        saveOpenSlots(next);
    };

    const handleResetDay = () => {
        const next = { ...localOpenSlots };
        delete next[effectiveKey];
        saveOpenSlots(next);
    };

    const handleCustomizeDayFromDefault = () => {
        const next = { ...localOpenSlots, [effectiveKey]: defaultWindows.map(w => ({ from: w.from, to: w.to })) };
        setLocalOpenSlots(next);
    };

    const handleMarkClosed = () => {
        const next = { ...localOpenSlots, [effectiveKey]: [] };
        saveOpenSlots(next);
    };

    const handleMarkOpen = () => {
        const next = { ...localOpenSlots };
        delete next[effectiveKey];
        saveOpenSlots(next);
    };

    // "Tüm günlere uygula" — Tüm Kortlar modunda: tüm 7 gün key'ine yaz + global şablon('0')
    const handleSetAsDefault = () => {
        if (!isCustomized || selectedCourt) return;
        const next = { ...localOpenSlots, '0': dayWindows };
        ['1','2','3','4','5','6','7'].forEach(d => { next[d] = [...dayWindows]; });
        saveOpenSlots(next);
    };

    // "Tüm günlere uygula" — Belirli kort modunda: bu kortun bu günkü saatlerini tüm günlere yaz
    const handleApplyCourtAllDays = () => {
        if (!isCustomized || !selectedCourt) return;
        const next = { ...localOpenSlots };
        ['1','2','3','4','5','6','7'].forEach(d => { next[`${selectedCourt}_${d}`] = [...dayWindows]; });
        saveOpenSlots(next);
    };

    // "Tüm kortlara uygula" — Bu günkü saatleri tüm kortların bu günü için yaz
    const handleApplyToAllCourts = () => {
        if (!isCustomized || !selectedCourt) return;
        const next = { ...localOpenSlots };
        sortedCourts.forEach(c => { next[`${c.id}_${dayKey}`] = [...dayWindows]; });
        saveOpenSlots(next);
    };

    const handleSavePolicy = async (field, value) => {
        setSavingPolicy(true);
        try {
            await api.patch(`/venues/${venue.id}/settings`, { [field]: value });
            if (field === 'cancelHoursBefore') setLocalCancelPolicy(value);
            else setLocalReschedulePolicy(value);
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Kaydedilemedi'); }
        finally { setSavingPolicy(false); }
    };

    const handleAddWindow = () => {
        const from = normalizeTime(newFrom);
        const to   = normalizeTime(newTo);
        if (!isValidTime(from) || !isValidTime(to)) { Alert.alert('Hata', 'Geçerli saat girin (ör: 8, 8:30, 08:00)'); return; }
        const existing = isCustomized ? dayWindows : []; // Varsayılan günde "+" → sıfırdan başla
        const next = { ...localOpenSlots, [effectiveKey]: [...existing, { from, to }].sort((a, b) => a.from.localeCompare(b.from)) };
        setAddingWindow(false);
        setNewFrom('');
        setNewTo('');
        saveOpenSlots(next);
    };

    const handleDelete = () => {
        Alert.alert('Tesisi Sil', `"${venue.name}" silinecek. Emin misiniz?`, [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Sil', style: 'destructive', onPress: async () => {
                setDeleting(true);
                try { await api.delete(`/venues/${venue.id}`); onDelete?.(venue.id); }
                catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Silinemedi'); }
                finally { setDeleting(false); }
            }},
        ]);
    };

    const statusColor = STATUS_COLOR[venue.status] || '#9ca3af';
    const statusLabel = STATUS_LABEL[venue.status] || venue.status;
    const slotLabel   = SLOT_TYPES.find(s => s.key === venue.slotType)?.label || venue.slotType;

    const TABS = [
        { key: 'info',         label: 'ℹ️ Bilgi' },
        isApproved ? { key: 'reservations', label: '📅 Rezervasyonlar' } : null,
        isApproved ? { key: 'analytics',    label: '📊 Rapor' }          : null,
        isApproved ? { key: 'blocks',       label: '🚫 Engel' } : null,
        isApproved && isPro ? { key: 'menu',   label: '📋 Menü' }   : null,
        isApproved && isPro ? { key: 'orders',   label: '🛒 Sipariş' } : null,
        isApproved          ? { key: 'settings', label: '⚙️ Ayarlar' } : null,
    ].filter(Boolean);

    return (
        <View style={vc.card}>
            <View style={vc.header}>
                <View style={{ flex: 1 }}>
                    <Text style={vc.name}>{venue.name}</Text>
                    <Text style={vc.meta}>{venue.branch} · {venue.city}{venue.district ? ` / ${venue.district}` : ''}</Text>
                </View>
                <View style={[vc.badge, { backgroundColor: statusColor + '20', borderColor: statusColor + '60' }]}>
                    <Text style={[vc.badgeText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
            </View>

            {venue.adminNote ? <View style={vc.noteBox}><Text style={vc.noteText}>📝 {venue.adminNote}</Text></View> : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 4 }}>
                    {TABS.map(tab => (
                        <TouchableOpacity key={tab.key}
                            style={[vc.tab, activeTab === tab.key && vc.tabActive]}
                            onPress={() => handleTab(tab.key)}>
                            <Text style={[vc.tabTxt, activeTab === tab.key && vc.tabTxtActive]}>{tab.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            {activeTab === 'info' && (() => {
                const getDayW = (d) => {
                    if (!(venue.openDays || [1,2,3,4,5,6,7]).includes(d)) return null;
                    const os = venue.openSlots;
                    if (os && !Array.isArray(os) && typeof os === 'object') {
                        const entry = os[String(d)] !== undefined ? os[String(d)] : os['0'];
                        if (entry !== undefined) {
                            if (Array.isArray(entry) && entry.length === 0) return null;
                            if (Array.isArray(entry) && entry.length > 0) return entry;
                        }
                    }
                    return [{ from: venue.openTime || '08:00', to: venue.closeTime || '22:00' }];
                };
                const dayNames = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
                const groups = [];
                for (let d = 1; d <= 7; d++) {
                    const w = getDayW(d);
                    const key = w === null ? 'CLOSED' : w.map(x => `${x.from}-${x.to}`).join(',');
                    const last = groups[groups.length - 1];
                    if (last && last.key === key) last.days.push(d);
                    else groups.push({ key, days: [d], windows: w });
                }
                return (
                    <>
                        <View style={vc.infoRow}>
                            <Text style={vc.infoItem}>🏟️ {venue.courts?.length || 0} kort</Text>
                            <Text style={vc.infoItem}>📅 {slotLabel}</Text>
                        </View>
                        <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
                            {groups.map((g, i) => {
                                const label = g.days.length === 1
                                    ? dayNames[g.days[0]]
                                    : `${dayNames[g.days[0]]}–${dayNames[g.days[g.days.length - 1]]}`;
                                const hours = g.windows === null
                                    ? 'Kapalı'
                                    : g.windows.map(x => `${x.from}–${x.to}`).join('  ');
                                return (
                                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#ffffff08' }}>
                                        <Text style={{ color: '#aaa', fontSize: 12, fontWeight: '700', minWidth: 60 }}>{label}</Text>
                                        <Text style={{ color: g.windows === null ? '#ef4444' : '#fff', fontSize: 12, fontWeight: g.windows === null ? '700' : '400' }}>{hours}</Text>
                                    </View>
                                );
                            })}
                        </View>
                        <TouchableOpacity style={vc.deleteBtn} onPress={handleDelete} disabled={deleting} activeOpacity={0.8}>
                            {deleting ? <ActivityIndicator size="small" color="#f87171" /> : <Text style={vc.deleteBtnText}>Tesisi Sil</Text>}
                        </TouchableOpacity>
                    </>
                );
            })()}

            {activeTab === 'blocks' && (
                <View style={vc.panel}>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                        <TextInput
                            style={[ic.input, { flex: 1, marginBottom: 0 }]}
                            placeholder="Kullanıcı adı ile engelle"
                            placeholderTextColor={colors.textMuted}
                            value={blockQ} onChangeText={setBlockQ}
                            autoCapitalize="none"
                        />
                        <TouchableOpacity style={vc.blockBtn} onPress={handleBlock} disabled={blocking}>
                            {blocking ? <ActivityIndicator size="small" color="#fff" /> : <Text style={vc.blockBtnTxt}>Engelle</Text>}
                        </TouchableOpacity>
                    </View>
                    {blocks.length === 0
                        ? <Text style={vc.emptyTxt}>Engellenen kullanıcı yok</Text>
                        : blocks.map(b => (
                            <View key={b.id} style={vc.blockRow}>
                                <Text style={vc.blockUser}>@{b.user?.username}</Text>
                                <TouchableOpacity onPress={() => handleUnblock(b.userId)}>
                                    <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '700' }}>Kaldır</Text>
                                </TouchableOpacity>
                            </View>
                        ))
                    }
                </View>
            )}

            {activeTab === 'menu' && (
                <View style={vc.panel}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                            {MENU_CATS.map(c => (
                                <TouchableOpacity key={c.key}
                                    style={[vc.catBtn, mCat === c.key && vc.catBtnActive]}
                                    onPress={() => setMCat(c.key)}>
                                    <Text style={[vc.catBtnTxt, mCat === c.key && { color: BIZ_COLOR }]}>{c.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                        <TextInput style={[ic.input, { flex: 2, marginBottom: 0 }]}
                            placeholder="Ürün adı" placeholderTextColor={colors.textMuted}
                            value={mName} onChangeText={setMName} />
                        <TextInput style={[ic.input, { flex: 1, marginBottom: 0 }]}
                            placeholder="₺" placeholderTextColor={colors.textMuted}
                            value={mPrice} onChangeText={setMPrice} keyboardType="numeric" />
                        <TouchableOpacity style={vc.blockBtn} onPress={handleAddItem} disabled={addingItem}>
                            {addingItem ? <ActivityIndicator size="small" color="#fff" /> : <Text style={vc.blockBtnTxt}>+</Text>}
                        </TouchableOpacity>
                    </View>
                    {menuItems.length === 0
                        ? <Text style={vc.emptyTxt}>Henüz menü kalemi yok. Yukarıdan ekleyin.</Text>
                        : menuItems.map(item => (
                            <View key={item.id} style={vc.menuRow}>
                                <Text style={{ color: item.available ? '#fff' : '#555', flex: 1, fontSize: 13 }} numberOfLines={1}>
                                    {MENU_CATS.find(c => c.key === item.category)?.label.split(' ')[0]} {item.name}
                                </Text>
                                <Text style={{ color: BIZ_COLOR, fontSize: 13, fontWeight: '700', marginRight: 8 }}>{item.price}₺</Text>
                                <Switch value={item.available} onValueChange={() => toggleItem(item)}
                                    trackColor={{ false: '#333', true: BIZ_COLOR + '60' }}
                                    thumbColor={item.available ? BIZ_COLOR : '#555'}
                                    style={{ transform: [{ scale: 0.7 }] }} />
                                <TouchableOpacity onPress={() => deleteItem(item.id)} style={{ marginLeft: 4 }}>
                                    <Text style={{ color: '#ef4444', fontSize: 13 }}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        ))
                    }
                </View>
            )}

            {activeTab === 'orders' && (
                <View style={vc.panel}>
                    {orders.length === 0
                        ? <Text style={vc.emptyTxt}>Henüz sipariş yok</Text>
                        : orders.slice(0, 15).map(order => (
                            <View key={order.id} style={vc.orderCard}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>@{order.user?.username}</Text>
                                    <Text style={{ color: ORDER_COLORS[order.status], fontSize: 12, fontWeight: '600' }}>{ORDER_LABELS[order.status]}</Text>
                                </View>
                                {order.items?.map((it, i) => (
                                    <Text key={i} style={{ color: '#aaa', fontSize: 12 }}>
                                        {it.quantity}× {it.menuItem?.name} — {it.unitPrice * it.quantity}₺
                                    </Text>
                                ))}
                                <Text style={{ color: BIZ_COLOR, fontWeight: '700', marginTop: 4, fontSize: 13 }}>Toplam: {order.totalPrice}₺</Text>
                                {order.status === 'PENDING' && (
                                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                        <TouchableOpacity style={vc.orderBtn} onPress={() => handleOrderStatus(order.id, 'CONFIRMED')}>
                                            <Text style={vc.orderBtnTxt}>✅ Onayla</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[vc.orderBtn, { borderColor: '#ef444440' }]} onPress={() => handleOrderStatus(order.id, 'CANCELLED')}>
                                            <Text style={[vc.orderBtnTxt, { color: '#f87171' }]}>❌ İptal</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                {order.status === 'CONFIRMED' && (
                                    <TouchableOpacity style={vc.orderBtn} onPress={() => handleOrderStatus(order.id, 'READY')} style={{ marginTop: 6 }}>
                                        <Text style={vc.orderBtnTxt}>🟢 Hazır İşaretle</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))
                    }
                </View>
            )}

            {activeTab === 'reservations' && (() => {
                const nowRes = new Date();
                const todayResStr = nowRes.toISOString().slice(0, 10);
                const pendingApproval = reservations.filter(r => r.status === 'PENDING');
                const todayList = reservations.filter(r => r.date === todayResStr && r.status !== 'CANCELLED');
                return (
                <View style={vc.panel}>
                    <TouchableOpacity style={vc.scheduleBtn} onPress={() => setScheduleOpen(true)}>
                        <Text style={vc.scheduleBtnTxt}>📅 Takvimi Görüntüle</Text>
                    </TouchableOpacity>

                    {/* Onay bekleyen geçmiş nakit rezervasyonlar */}
                    {pendingApproval.length > 0 && (
                        <View style={{ marginBottom: 16 }}>
                            <Text style={{ color: '#eab308', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
                                ⏳ ONAY BEKLİYOR ({pendingApproval.length})
                            </Text>
                            {pendingApproval.map(r => {
                                const isPast = new Date(`${r.date}T${r.startTime}:00`) <= nowRes;
                                const payLabel = r.paymentMethod === 'EFT' ? '🏦 EFT' : r.paymentMethod === 'ONLINE' ? '💳 Online' : '💵 Nakit';
                                return (
                                <View key={r.id} style={[vc.resCard, { flexDirection: 'column', alignItems: 'stretch', borderColor: '#eab30840', borderWidth: 1 }]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={vc.resTime}>{r.court?.name}  {r.startTime}–{r.endTime}</Text>
                                        <Text style={vc.resUser}>@{r.user?.username || '—'} · {r.date}</Text>
                                        <Text style={vc.resMeta}>{payLabel} · ⏳ Onay Bekliyor</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                                        <TouchableOpacity
                                            style={{ flex: 1, backgroundColor: '#22c55e18', borderRadius: 8, paddingVertical: 7, alignItems: 'center', borderWidth: 1, borderColor: '#22c55e40' }}
                                            onPress={() => handleUpdateResStatus(r.id, 'confirm')}>
                                            <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '700' }}>✅ Onayla</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={{ flex: 1, backgroundColor: '#ef444418', borderRadius: 8, paddingVertical: 7, alignItems: 'center', borderWidth: 1, borderColor: '#ef444440' }}
                                            onPress={() => Alert.alert(isPast ? 'Gelmedi / İptal' : 'Reddet', isPast ? 'Müşteri gelmedi olarak işaretlensin mi?' : 'Rezervasyon reddedilsin mi?', [
                                                { text: 'Vazgeç', style: 'cancel' },
                                                { text: isPast ? 'Gelmedi' : 'Reddet', style: 'destructive', onPress: () => handleUpdateResStatus(r.id, isPast ? 'noshow' : 'reject') },
                                            ])}>
                                            <Text style={{ color: '#f87171', fontSize: 12, fontWeight: '700' }}>{isPast ? '❌ Gelmedi' : '❌ Reddet'}</Text>
                                        </TouchableOpacity>
                                        {isPast && r.paymentMethod === 'CASH' && (
                                        <TouchableOpacity
                                            style={{ backgroundColor: '#7c3aed18', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1, borderColor: '#7c3aed40' }}
                                            onPress={() => Alert.alert('Admine Bildir', 'Ödeme alınmadı olarak admine yüksek öncelikli bildirim gönderilsin mi?', [
                                                { text: 'Vazgeç', style: 'cancel' },
                                                { text: 'Bildir', style: 'destructive', onPress: () => handleUpdateResStatus(r.id, 'no_payment') },
                                            ])}>
                                            <Text style={{ color: '#a78bfa', fontSize: 11, fontWeight: '700' }}>🚨</Text>
                                        </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                                );
                            })}
                        </View>
                    )}

                    {/* Bugünün rezervasyonları */}
                    <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
                        BUGÜN
                    </Text>
                    {todayList.map(r => (
                        <View key={r.id} style={[vc.resCard, { flexDirection: 'column', alignItems: 'stretch' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={vc.resTime}>{r.court?.name}  {r.startTime}–{r.endTime}</Text>
                                    <Text style={vc.resUser}>@{r.user?.username || '—'}</Text>
                                    <Text style={vc.resMeta}>
                                        {r.paymentMethod === 'EFT' ? '🏦 EFT' : r.paymentMethod === 'ONLINE' ? '💳 Online' : '💵 Kortta Öde'}
                                        {r.status === 'PENDING' ? '  · ⏳ Bekleniyor' : r.status === 'CONFIRMED' ? '  · ✅ Onaylandı' : ''}
                                        {r.noShow ? '  · ❌ Gelmedi' : ''}
                                    </Text>
                                </View>
                                <TouchableOpacity style={vc.resCancelBtn}
                                    onPress={() => Alert.alert('İptal Et', `${r.user?.username} kişisinin rezervasyonu iptal edilsin mi?`, [
                                        { text: 'Vazgeç', style: 'cancel' },
                                        { text: 'İptal Et', style: 'destructive', onPress: () => handleCancelReservation(r.id) },
                                    ])}>
                                    <Text style={vc.resCancelTxt}>İptal</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                    {resLoaded && todayList.length === 0 && pendingApproval.length === 0 && (
                        <Text style={vc.emptyTxt}>Bugün rezervasyon yok</Text>
                    )}
                </View>
                );
            })()}

            {activeTab === 'settings' && (
                <View style={vc.panel}>
                    {/* ── Çalışma Saatleri ─────────────────────── */}
                    <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 }}>
                        ÇALIŞMA SAATLERİ
                    </Text>

                    {/* Kort seçici */}
                    {sortedCourts.length > 1 && (
                        <View style={{ flexDirection: 'row', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
                            <TouchableOpacity onPress={() => { setSelectedCourt(null); setAddingWindow(false); setNewFrom(''); setNewTo(''); }}
                                style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1.5,
                                    borderColor: !selectedCourt ? BIZ_COLOR : '#ffffff15',
                                    backgroundColor: !selectedCourt ? BIZ_COLOR + '28' : 'transparent' }}>
                                <Text style={{ color: !selectedCourt ? BIZ_LIGHT : '#777', fontSize: 11, fontWeight: !selectedCourt ? '800' : '400' }}>
                                    Tüm Kortlar
                                </Text>
                            </TouchableOpacity>
                            {sortedCourts.map(c => (
                                <TouchableOpacity key={c.id} onPress={() => { setSelectedCourt(c.id); setAddingWindow(false); setNewFrom(''); setNewTo(''); }}
                                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1.5,
                                        borderColor: selectedCourt === c.id ? BIZ_COLOR : '#ffffff15',
                                        backgroundColor: selectedCourt === c.id ? BIZ_COLOR + '28' : 'transparent' }}>
                                    <Text style={{ color: selectedCourt === c.id ? BIZ_LIGHT : '#777', fontSize: 11, fontWeight: selectedCourt === c.id ? '800' : '400' }}>
                                        {c.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Gün seçici */}
                    <View style={{ flexDirection: 'row', gap: 5, marginBottom: 14, flexWrap: 'wrap' }}>
                        {[
                            { d: 1, lbl: 'Pzt' }, { d: 2, lbl: 'Sal' }, { d: 3, lbl: 'Çar' },
                            { d: 4, lbl: 'Per' }, { d: 5, lbl: 'Cum' }, { d: 6, lbl: 'Cmt' },
                            { d: 7, lbl: 'Paz' },
                        ].map(({ d, lbl }) => {
                            const isActive    = selectedDay === d;
                            const eKey        = selectedCourt ? `${selectedCourt}_${d}` : String(d);
                            const entry       = localOpenSlots[eKey];
                            const isDayClosed = Array.isArray(entry) && entry.length === 0;
                            const isDayCustom = Array.isArray(entry) && entry.length > 0;
                            const borderClr   = isActive ? BIZ_COLOR : isDayClosed ? '#ef444460' : isDayCustom ? BIZ_COLOR + '40' : '#ffffff15';
                            const bgClr       = isActive ? BIZ_COLOR + '28' : isDayClosed ? '#ef444412' : 'transparent';
                            const txtClr      = isActive ? BIZ_LIGHT : isDayClosed ? '#ef4444aa' : isDayCustom ? BIZ_COLOR + 'cc' : '#777';
                            return (
                                <TouchableOpacity key={d} onPress={() => { setSelectedDay(d); setAddingWindow(false); setNewFrom(''); setNewTo(''); }}
                                    style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5,
                                        borderColor: borderClr, backgroundColor: bgClr }}>
                                    <Text style={{ color: txtClr, fontWeight: isActive || isDayCustom ? '800' : '400', fontSize: 12 }}>
                                        {isDayClosed ? `${lbl} ✕` : lbl}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Seçili günün saatleri */}
                    {isClosed ? (
                        /* ── KAPALI GÜN ── */
                        <View style={{ backgroundColor: '#ef444415', borderRadius: 10, padding: 14, marginBottom: 8,
                            borderWidth: 1, borderColor: '#ef444430', alignItems: 'center' }}>
                            <Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 14, marginBottom: 10 }}>
                                Bu gün kapalı
                            </Text>
                            <TouchableOpacity onPress={handleMarkOpen}
                                style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8, backgroundColor: '#ffffff15',
                                    borderWidth: 1, borderColor: '#ffffff25' }}>
                                <Text style={{ color: '#ccc', fontSize: 12, fontWeight: '700' }}>↺ Varsayılana Dön</Text>
                            </TouchableOpacity>
                        </View>
                    ) : isCustomized ? (
                        /* ── ÖZEL SAATLER ── */
                        <>
                            {dayWindows.map((w, idx) => {
                                const slots = previewSlots([w]);
                                return (
                                    <View key={idx} style={{ marginBottom: 7, backgroundColor: '#ffffff08', borderRadius: 10,
                                        paddingHorizontal: 14, paddingVertical: 10 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={{ color: BIZ_LIGHT, fontWeight: '800', fontSize: 15, flex: 1 }}>
                                                {w.from} – {w.to}
                                            </Text>
                                            <TouchableOpacity onPress={() => handleRemoveWindow(idx)} style={{ padding: 4 }}>
                                                <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '700' }}>✕</Text>
                                            </TouchableOpacity>
                                        </View>
                                        {slots.length > 0 && (
                                            <Text style={{ color: '#4ade8099', fontSize: 10, marginTop: 4 }}>
                                                {slots.slice(0, 6).join('  ')}{slots.length > 6 ? `  …+${slots.length - 6}` : ''}
                                                {'  '}({slots.length} slot)
                                            </Text>
                                        )}
                                    </View>
                                );
                            })}
                            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                                <TouchableOpacity onPress={handleResetDay}
                                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: '#ffffff0a',
                                        borderWidth: 1, borderColor: '#ffffff15' }}>
                                    <Text style={{ color: '#6b7280', fontSize: 11 }}>↺ Sıfırla</Text>
                                </TouchableOpacity>
                                {!selectedCourt ? (
                                    /* Tüm Kortlar modunda: tüm günlere uygula */
                                    <TouchableOpacity onPress={handleSetAsDefault}
                                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: BIZ_COLOR + '15',
                                            borderWidth: 1, borderColor: BIZ_COLOR + '35' }}>
                                        <Text style={{ color: BIZ_COLOR, fontSize: 11, fontWeight: '700' }}>⊙ Tüm günlere uygula</Text>
                                    </TouchableOpacity>
                                ) : (
                                    /* Belirli kort modunda: tüm kortlara + tüm günlere */
                                    <>
                                        <TouchableOpacity onPress={handleApplyToAllCourts}
                                            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: BIZ_COLOR + '15',
                                                borderWidth: 1, borderColor: BIZ_COLOR + '35' }}>
                                            <Text style={{ color: BIZ_COLOR, fontSize: 11, fontWeight: '700' }}>↔ Tüm kortlara uygula</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={handleApplyCourtAllDays}
                                            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: BIZ_COLOR + '15',
                                                borderWidth: 1, borderColor: BIZ_COLOR + '35' }}>
                                            <Text style={{ color: BIZ_COLOR, fontSize: 11, fontWeight: '700' }}>↕ Tüm günlere uygula</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        </>
                    ) : (
                        /* ── VARSAYILAN / ŞABLON SAATLER ── */
                        <>
                            {defaultWindows.map((w, i) => {
                                const slots = previewSlots([w]);
                                return (
                                    <View key={i} style={{ marginBottom: 7, backgroundColor: '#ffffff05', borderRadius: 10,
                                        paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#ffffff0a' }}>
                                        <Text style={{ color: '#888', fontSize: 14 }}>
                                            {w.from} – {w.to}
                                        </Text>
                                        {slots.length > 0 && (
                                            <Text style={{ color: '#4ade8055', fontSize: 10, marginTop: 4 }}>
                                                {slots.slice(0, 6).join('  ')}{slots.length > 6 ? `  …+${slots.length - 6}` : ''}
                                                {'  '}({slots.length} slot)
                                            </Text>
                                        )}
                                    </View>
                                );
                            })}
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                                <TouchableOpacity onPress={handleCustomizeDayFromDefault}
                                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: BIZ_COLOR + '22',
                                        borderWidth: 1, borderColor: BIZ_COLOR + '44' }}>
                                    <Text style={{ color: BIZ_LIGHT, fontSize: 11, fontWeight: '700' }}>Özelleştir</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleMarkClosed}
                                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: '#ef444415',
                                        borderWidth: 1, borderColor: '#ef444430' }}>
                                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>Kapalı</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}

                    {savingWindows && <ActivityIndicator color={BIZ_COLOR} style={{ marginVertical: 6 }} size="small" />}

                    {!isClosed && (addingWindow ? (
                        <View style={{ backgroundColor: '#ffffff08', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                            <Text style={{ color: '#aaa', fontSize: 12, marginBottom: 10 }}>Yeni aralık ekle</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <TouchableOpacity onPress={() => setShowTimePicker('from')}
                                    style={{ flex: 1, backgroundColor: newFrom ? BIZ_COLOR + '20' : '#ffffff10',
                                        borderRadius: 8, paddingVertical: 10, alignItems: 'center',
                                        borderWidth: 1.5, borderColor: newFrom ? BIZ_COLOR + '60' : '#ffffff20' }}>
                                    <Text style={{ color: newFrom ? BIZ_LIGHT : '#666', fontWeight: newFrom ? '800' : '400', fontSize: 16 }}>
                                        {newFrom || 'Başlangıç'}
                                    </Text>
                                </TouchableOpacity>
                                <Text style={{ color: '#555', fontSize: 18 }}>–</Text>
                                <TouchableOpacity onPress={() => setShowTimePicker('to')}
                                    style={{ flex: 1, backgroundColor: newTo ? BIZ_COLOR + '20' : '#ffffff10',
                                        borderRadius: 8, paddingVertical: 10, alignItems: 'center',
                                        borderWidth: 1.5, borderColor: newTo ? BIZ_COLOR + '60' : '#ffffff20' }}>
                                    <Text style={{ color: newTo ? BIZ_LIGHT : '#666', fontWeight: newTo ? '800' : '400', fontSize: 16 }}>
                                        {newTo || 'Bitiş'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity onPress={() => { setAddingWindow(false); setNewFrom(''); setNewTo(''); }}
                                    style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#ffffff12', alignItems: 'center' }}>
                                    <Text style={{ color: '#aaa', fontSize: 13 }}>Vazgeç</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleAddWindow} disabled={savingWindows}
                                    style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: BIZ_COLOR + '30', alignItems: 'center' }}>
                                    <Text style={{ color: BIZ_LIGHT, fontWeight: '700', fontSize: 13 }}>Ekle</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <TouchableOpacity onPress={() => { setAddingWindow(true); }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingVertical: 6 }}>
                            <Text style={{ color: BIZ_COLOR, fontSize: 20, fontWeight: '700' }}>+</Text>
                            <Text style={{ color: BIZ_COLOR, fontSize: 13, fontWeight: '600' }}>Aralık Ekle</Text>
                        </TouchableOpacity>
                    ))}

                    <TimePickerModal
                        visible={showTimePicker !== null}
                        value={showTimePicker === 'from' ? newFrom : newTo}
                        onSelect={t => {
                            if (showTimePicker === 'from') setNewFrom(t);
                            else setNewTo(t);
                            setShowTimePicker(null);
                        }}
                        onClose={() => setShowTimePicker(null)}
                    />

                    {isPro && (
                        <>
                            <View style={{ height: 1, backgroundColor: '#ffffff10', marginVertical: 20 }} />
                            <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 }}>
                                GECE IŞIKLARI
                            </Text>
                            <Text style={{ color: '#555', fontSize: 11, marginBottom: 10, lineHeight: 16 }}>
                                Tüm kortlara uygulanır. Işıklar bu saatten itibaren açık sayılır.
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <TouchableOpacity
                                    onPress={() => setShowVenueLightsPicker(true)}
                                    style={{ flex: 1, backgroundColor: venueLights ? '#fbbf2418' : '#ffffff08',
                                        borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14,
                                        borderWidth: 1.5, borderColor: venueLights ? '#fbbf2440' : '#ffffff18',
                                        flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 15 }}>💡</Text>
                                    <Text style={{ color: venueLights ? '#fbbf24' : '#555', fontWeight: venueLights ? '700' : '400', fontSize: 14 }}>
                                        {venueLights ? `${venueLights}'dan itibaren` : 'Belirlenmedi'}
                                    </Text>
                                </TouchableOpacity>
                                {venueLights && (
                                    <TouchableOpacity onPress={() => handleUpdateVenueLights(null)} style={{ padding: 8 }}>
                                        <Text style={{ color: '#6b7280', fontSize: 16 }}>✕</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <TimePickerModal
                                visible={showVenueLightsPicker}
                                value={venueLights || ''}
                                onSelect={t => { handleUpdateVenueLights(t); setShowVenueLightsPicker(false); }}
                                onClose={() => setShowVenueLightsPicker(false)}
                            />
                        </>
                    )}

                    <View style={{ height: 1, backgroundColor: '#ffffff10', marginBottom: 20, marginTop: isPro ? 20 : 0 }} />
                    <Text style={{ color: '#888', fontSize: 12, marginBottom: 14, lineHeight: 17 }}>
                        Her kort için rezervasyon tipini ayrı ayrı seçebilirsiniz. Değişiklik anında uygulanır.
                    </Text>
                    {sortedCourts.filter(c => !selectedCourt || c.id === selectedCourt).map(court => {
                        const currentType    = courtSlotTypes[court.id] || 'FULL_HOUR';
                        const currentSurface = courtSurfaces[court.id] || null;
                        return (
                            <View key={court.id} style={{ marginBottom: 28 }}>
                                <Text style={{ color: BIZ_LIGHT, fontWeight: '800', fontSize: 14, marginBottom: 10 }}>
                                    🏟 {court.name}
                                </Text>

                                {/* Rezervasyon tipi */}
                                <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 }}>
                                    REZERVASYON TİPİ
                                </Text>
                                {[
                                    { key: 'FULL_HOUR',    title: 'Tam Saatli',     desc: 'Saat başı 60 dk\n09:00–10:00 · 10:00–11:00' },
                                    { key: 'HALF_HOUR',    title: 'Buçuklu Saatli', desc: '30 dk geçmiş saatte başlar\n09:30–10:30 · 10:30–11:30' },
                                    { key: 'VAR_DURATION', title: 'Esnek Süre',     desc: 'Kullanıcı 60 / 90 / 120 dk seçer\nRezerasyonlar arka arkaya — boşluk yok' },
                                ].map(opt => {
                                    const isActive = currentType === opt.key;
                                    return (
                                        <TouchableOpacity key={opt.key}
                                            style={[vc.settingCard, isActive && vc.settingCardActive]}
                                            onPress={() => handleUpdateCourtSlotType(court.id, opt.key)}
                                            disabled={savingSlot}>
                                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                                                <View style={[vc.radio, isActive && vc.radioActive]}>
                                                    {isActive && <View style={vc.radioDot} />}
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: isActive ? BIZ_LIGHT : '#ddd', fontWeight: '800', fontSize: 14 }}>
                                                        {opt.title}
                                                    </Text>
                                                    <Text style={{ color: '#777', fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                                                        {opt.desc}
                                                    </Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}

                                {/* Zemin tipi */}
                                <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginTop: 10, marginBottom: 8, letterSpacing: 0.5 }}>
                                    ZEMİN TİPİ
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                    {[
                                        { key: 'CLAY',      label: 'Toprak',   icon: '🟤' },
                                        { key: 'HARD',      label: 'Sert Zemin', icon: '⬜' },
                                        { key: 'CARPET',    label: 'Halı Saha', icon: '🟥' },
                                        { key: 'GRASS',     label: 'Çim',       icon: '🌿' },
                                        { key: 'PARQUET',   label: 'Parke',     icon: '🟫' },
                                        { key: 'SYNTHETIC', label: 'Sentetik',  icon: '🟩' },
                                    ].map(s => {
                                        const isActive = currentSurface === s.key;
                                        return (
                                            <TouchableOpacity key={s.key}
                                                onPress={() => handleUpdateCourtSurface(court.id, s.key)}
                                                style={{
                                                    paddingHorizontal: 10, paddingVertical: 6,
                                                    borderRadius: 8, borderWidth: 1.5,
                                                    borderColor: isActive ? BIZ_COLOR + '80' : '#ffffff15',
                                                    backgroundColor: isActive ? BIZ_COLOR + '18' : 'transparent',
                                                }}>
                                                <Text style={{ color: isActive ? BIZ_LIGHT : '#888', fontSize: 12, fontWeight: isActive ? '700' : '400' }}>
                                                    {s.icon} {s.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                {currentSurface && (
                                    <Text style={{ color: '#555', fontSize: 11, marginTop: 6 }}>
                                        Seçili: {SURFACE_ICON[currentSurface]} {SURFACE_LABEL[currentSurface]} · Seçili zemine tekrar tıklayarak kaldırabilirsin
                                    </Text>
                                )}

                                {/* Kort başına fiyat override */}
                                <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 4, letterSpacing: 0.5 }}>
                                    KORT ÜCRETI (OPSİYONEL)
                                </Text>
                                <Text style={{ color: '#555', fontSize: 11, marginBottom: 8, lineHeight: 15 }}>
                                    Boş bırakırsanız tesis varsayılan fiyatı geçerli olur.
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <TextInput
                                        style={{ flex: 1, backgroundColor: '#ffffff0a', borderRadius: 8,
                                            paddingHorizontal: 12, paddingVertical: 7, color: '#fff',
                                            fontSize: 14, borderWidth: 1,
                                            borderColor: courtPrices[court.id] !== '' ? BIZ_COLOR + '60' : '#ffffff15' }}
                                        placeholder="Tesis varsayılanı"
                                        placeholderTextColor="#444"
                                        keyboardType="number-pad"
                                        value={courtPrices[court.id] ?? ''}
                                        onChangeText={v => setCourtPrices(prev => ({ ...prev, [court.id]: v }))}
                                        returnKeyType="done"
                                    />
                                    <Text style={{ color: '#555', fontSize: 14 }}>₺</Text>
                                    <TouchableOpacity disabled={savingPrice}
                                        onPress={() => handleSaveCourtPrice(court.id)}
                                        style={{ backgroundColor: BIZ_COLOR + '25', borderRadius: 8,
                                            paddingHorizontal: 12, paddingVertical: 7,
                                            borderWidth: 1, borderColor: BIZ_COLOR + '50' }}>
                                        <Text style={{ color: BIZ_LIGHT, fontWeight: '700', fontSize: 13 }}>Kaydet</Text>
                                    </TouchableOpacity>
                                </View>

                            </View>
                        );
                    })}
                    {savingSlot && <ActivityIndicator color={BIZ_COLOR} style={{ marginTop: 10 }} />}

                    {/* ── Fiyatlandırma ──── */}
                    <View style={{ height: 1, backgroundColor: '#ffffff10', marginVertical: 20 }} />
                    <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginBottom: 12, letterSpacing: 0.5 }}>
                        FİYATLANDIRMA
                    </Text>

                    {/* Saat aralığı kuralları */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
                            SAAT ARALIĞI KURALLARI
                        </Text>
                        {!addingPriceRule && (
                            <TouchableOpacity onPress={() => setAddingPriceRule(true)}
                                style={{ backgroundColor: BIZ_COLOR + '20', borderRadius: 6,
                                    paddingHorizontal: 10, paddingVertical: 4,
                                    borderWidth: 1, borderColor: BIZ_COLOR + '40' }}>
                                <Text style={{ color: BIZ_LIGHT, fontWeight: '700', fontSize: 12 }}>+ Ekle</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={{ color: '#555', fontSize: 11, marginBottom: 10, lineHeight: 15 }}>
                        Belirli saat aralıklarına özel fiyat tanımlayın. Önce kort+aralık eşleşmesi, sonra tüm kortlar için aralık, sonra kort fiyatı, en son varsayılan geçerli olur.
                    </Text>

                    {localPricingWindows.length === 0 && !addingPriceRule && (
                        <Text style={{ color: '#444', fontSize: 12, marginBottom: 10 }}>Henüz saat aralığı kuralı yok.</Text>
                    )}

                    {localPricingWindows.map((rule, idx) => {
                        const courtName = rule.courtId
                            ? (venue.courts || []).find(c => c.id === rule.courtId)?.name || 'Bilinmeyen Kort'
                            : 'Tüm Kortlar';
                        return (
                            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                backgroundColor: '#ffffff08', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
                                marginBottom: 6, borderWidth: 1, borderColor: '#ffffff12' }}>
                                <View>
                                    <Text style={{ color: BIZ_LIGHT, fontWeight: '700', fontSize: 13 }}>
                                        {rule.from} – {rule.to} · {rule.price > 0 ? `${rule.price}₺` : 'Ücretsiz'}
                                    </Text>
                                    <Text style={{ color: '#555', fontSize: 11, marginTop: 2 }}>{courtName}</Text>
                                </View>
                                <TouchableOpacity disabled={savingPrice} onPress={() => handleDeletePricingRule(idx)}
                                    style={{ padding: 4 }}>
                                    <Text style={{ color: '#cc4444', fontSize: 16 }}>🗑</Text>
                                </TouchableOpacity>
                            </View>
                        );
                    })}

                    {addingPriceRule && (
                        <View style={{ backgroundColor: '#ffffff08', borderRadius: 10, padding: 12,
                            marginBottom: 10, borderWidth: 1, borderColor: BIZ_COLOR + '30' }}>
                            <Text style={{ color: BIZ_LIGHT, fontWeight: '700', fontSize: 13, marginBottom: 10 }}>
                                Yeni Kural
                            </Text>

                            {/* Saat aralığı */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <TouchableOpacity onPress={() => setShowPriceFromPicker(true)}
                                    style={{ flex: 1, backgroundColor: '#ffffff0a', borderRadius: 8,
                                        paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1,
                                        borderColor: newRuleFrom ? BIZ_COLOR + '60' : '#ffffff15', alignItems: 'center' }}>
                                    <Text style={{ color: newRuleFrom ? BIZ_LIGHT : '#444', fontWeight: '700' }}>
                                        {newRuleFrom || 'Başlangıç'}
                                    </Text>
                                </TouchableOpacity>
                                <Text style={{ color: '#444' }}>–</Text>
                                <TouchableOpacity onPress={() => setShowPriceToPicker(true)}
                                    style={{ flex: 1, backgroundColor: '#ffffff0a', borderRadius: 8,
                                        paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1,
                                        borderColor: newRuleTo ? BIZ_COLOR + '60' : '#ffffff15', alignItems: 'center' }}>
                                    <Text style={{ color: newRuleTo ? BIZ_LIGHT : '#444', fontWeight: '700' }}>
                                        {newRuleTo || 'Bitiş'}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* Fiyat */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <TextInput
                                    style={{ flex: 1, backgroundColor: '#ffffff0a', borderRadius: 8,
                                        paddingHorizontal: 12, paddingVertical: 7, color: '#fff',
                                        fontSize: 14, borderWidth: 1,
                                        borderColor: newRulePrice !== '' ? BIZ_COLOR + '60' : '#ffffff15' }}
                                    placeholder="Fiyat"
                                    placeholderTextColor="#444"
                                    keyboardType="number-pad"
                                    value={newRulePrice}
                                    onChangeText={setNewRulePrice}
                                />
                                <Text style={{ color: '#555', fontSize: 14 }}>₺</Text>
                            </View>

                            {/* Kort seçimi */}
                            <Text style={{ color: '#666', fontSize: 11, marginBottom: 6 }}>Kort (boş = tüm kortlar)</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                <TouchableOpacity onPress={() => setNewRuleCourtId(null)}
                                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                                        borderWidth: 1.5,
                                        borderColor: !newRuleCourtId ? BIZ_COLOR + '80' : '#ffffff15',
                                        backgroundColor: !newRuleCourtId ? BIZ_COLOR + '18' : 'transparent' }}>
                                    <Text style={{ color: !newRuleCourtId ? BIZ_LIGHT : '#888', fontSize: 12, fontWeight: '700' }}>
                                        Tüm Kortlar
                                    </Text>
                                </TouchableOpacity>
                                {(venue.courts || []).map(c => (
                                    <TouchableOpacity key={c.id} onPress={() => setNewRuleCourtId(c.id)}
                                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                                            borderWidth: 1.5,
                                            borderColor: newRuleCourtId === c.id ? BIZ_COLOR + '80' : '#ffffff15',
                                            backgroundColor: newRuleCourtId === c.id ? BIZ_COLOR + '18' : 'transparent' }}>
                                        <Text style={{ color: newRuleCourtId === c.id ? BIZ_LIGHT : '#888', fontSize: 12, fontWeight: '700' }}>
                                            {c.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TouchableOpacity disabled={savingPrice} onPress={handleAddPricingRule}
                                    style={{ flex: 1, backgroundColor: BIZ_COLOR + '30', borderRadius: 8,
                                        paddingVertical: 10, alignItems: 'center',
                                        borderWidth: 1, borderColor: BIZ_COLOR + '60' }}>
                                    {savingPrice
                                        ? <ActivityIndicator size="small" color={BIZ_COLOR} />
                                        : <Text style={{ color: BIZ_LIGHT, fontWeight: '700' }}>Kaydet</Text>}
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => {
                                    setAddingPriceRule(false);
                                    setNewRuleFrom(''); setNewRuleTo(''); setNewRulePrice(''); setNewRuleCourtId(null);
                                }}
                                    style={{ flex: 1, borderRadius: 8, paddingVertical: 10,
                                        alignItems: 'center', borderWidth: 1, borderColor: '#ffffff15' }}>
                                    <Text style={{ color: '#666', fontWeight: '700' }}>İptal</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    <TimePickerModal
                        visible={showPriceFromPicker}
                        value={newRuleFrom || ''}
                        onSelect={t => { setNewRuleFrom(t); setShowPriceFromPicker(false); }}
                        onClose={() => setShowPriceFromPicker(false)}
                    />
                    <TimePickerModal
                        visible={showPriceToPicker}
                        value={newRuleTo || ''}
                        onSelect={t => { setNewRuleTo(t); setShowPriceToPicker(false); }}
                        onClose={() => setShowPriceToPicker(false)}
                    />

                    {/* ── Konum ──── */}
                    <View style={{ height: 1, backgroundColor: '#ffffff10', marginVertical: 20 }} />
                    <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 }}>
                        KONUM
                    </Text>
                    <Text style={{ color: '#555', fontSize: 11, marginBottom: 12, lineHeight: 15 }}>
                        Google Maps'te konumu bul → Konuma uzun bas → Enlem/Boylam kopyala
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Enlem</Text>
                            <TextInput
                                style={{ backgroundColor: '#ffffff0a', borderRadius: 8,
                                    paddingHorizontal: 12, paddingVertical: 7, color: '#fff',
                                    fontSize: 13, borderWidth: 1,
                                    borderColor: localLat ? BIZ_COLOR + '60' : '#ffffff15' }}
                                placeholder="41.0082"
                                placeholderTextColor="#444"
                                keyboardType="decimal-pad"
                                value={localLat}
                                onChangeText={setLocalLat}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Boylam</Text>
                            <TextInput
                                style={{ backgroundColor: '#ffffff0a', borderRadius: 8,
                                    paddingHorizontal: 12, paddingVertical: 7, color: '#fff',
                                    fontSize: 13, borderWidth: 1,
                                    borderColor: localLng ? BIZ_COLOR + '60' : '#ffffff15' }}
                                placeholder="28.9784"
                                placeholderTextColor="#444"
                                keyboardType="decimal-pad"
                                value={localLng}
                                onChangeText={setLocalLng}
                            />
                        </View>
                    </View>
                    <TouchableOpacity disabled={savingLocation}
                        onPress={handleSaveLocation}
                        style={{ backgroundColor: BIZ_COLOR + '20', borderRadius: 8,
                            paddingHorizontal: 14, paddingVertical: 9,
                            borderWidth: 1, borderColor: BIZ_COLOR + '40', alignSelf: 'flex-end', marginBottom: 4 }}>
                        <Text style={{ color: BIZ_LIGHT, fontWeight: '700', fontSize: 13 }}>
                            {savingLocation ? 'Kaydediliyor...' : 'Kaydet'}
                        </Text>
                    </TouchableOpacity>

                    {/* ── İletişim Butonları ──── */}
                    <View style={{ height: 1, backgroundColor: '#ffffff10', marginVertical: 20 }} />
                    <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 }}>
                        İLETİŞİM BUTONLARI
                    </Text>
                    <Text style={{ color: '#555', fontSize: 11, marginBottom: 12, lineHeight: 15 }}>
                        Kullanıcılar rezervasyon sırasında bu butonları görecek.
                    </Text>

                    {[
                        { key: 'whatsapp',  label: 'WhatsApp',  placeholder: '5551234567', prefix: '+90', keyboardType: 'phone-pad' },
                        { key: 'phone',     label: 'Beni Ara',  placeholder: '5551234567', prefix: '+90', keyboardType: 'phone-pad' },
                        { key: 'telegram',  label: 'Telegram',  placeholder: '@kullanici', prefix: null, keyboardType: 'default' },
                        { key: 'instagram', label: 'Instagram', placeholder: '@hesap',     prefix: null, keyboardType: 'default' },
                        { key: 'email',     label: 'E-posta',   placeholder: 'info@tesis.com', prefix: null, keyboardType: 'email-address' },
                    ].map(item => (
                        <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Text style={{ color: '#666', fontSize: 12, fontWeight: '700', width: 72 }}>{item.label}</Text>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center',
                                backgroundColor: '#ffffff0a', borderRadius: 8, borderWidth: 1,
                                borderColor: localContactLinks[item.key] ? BIZ_COLOR + '60' : '#ffffff15', overflow: 'hidden' }}>
                                {item.prefix && (
                                    <Text style={{ color: '#888', fontSize: 13, paddingLeft: 10, paddingRight: 4 }}>{item.prefix}</Text>
                                )}
                                <TextInput
                                    style={{ flex: 1, paddingHorizontal: item.prefix ? 4 : 12,
                                        paddingVertical: 7, color: '#fff', fontSize: 13 }}
                                    placeholder={item.placeholder}
                                    placeholderTextColor="#444"
                                    value={localContactLinks[item.key] || ''}
                                    onChangeText={v => setLocalContactLinks(p => ({ ...p, [item.key]: v }))}
                                    autoCapitalize="none"
                                    keyboardType={item.keyboardType}
                                />
                            </View>
                        </View>
                    ))}
                    <TouchableOpacity disabled={savingContactLinks}
                        onPress={handleSaveContactLinks}
                        style={{ backgroundColor: BIZ_COLOR + '20', borderRadius: 8,
                            paddingHorizontal: 14, paddingVertical: 9,
                            borderWidth: 1, borderColor: BIZ_COLOR + '40', alignSelf: 'flex-end', marginTop: 4 }}>
                        <Text style={{ color: BIZ_LIGHT, fontWeight: '700', fontSize: 13 }}>
                            {savingContactLinks ? 'Kaydediliyor...' : 'Kaydet'}
                        </Text>
                    </TouchableOpacity>

                    {/* ── İptal & Değişiklik Politikası ──── */}
                    <View style={{ height: 1, backgroundColor: '#ffffff10', marginVertical: 20 }} />
                    {[
                        { label: 'İPTAL POLİTİKASI', field: 'cancelHoursBefore',     current: localCancelPolicy,
                          desc: 'Kullanıcılar rezervasyondan kaç saat öncesine kadar iptal edebilsin?' },
                        { label: 'DEĞİŞİKLİK POLİTİKASI', field: 'rescheduleHoursBefore', current: localReschedulePolicy,
                          desc: 'Kullanıcılar rezervasyondan kaç saat öncesine kadar tarih/saat değiştirebilsin?' },
                    ].map(pol => {
                        const quickOpts = [null, 1, 2, 3, 6, 12, 24, 48, 72, -1];
                        const isCustom  = pol.current !== null && pol.current >= 0 && !quickOpts.includes(pol.current);
                        return (
                        <View key={pol.field} style={{ marginBottom: 20 }}>
                            <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 }}>{pol.label}</Text>
                            <Text style={{ color: '#555', fontSize: 11, marginBottom: 10, lineHeight: 16 }}>{pol.desc}</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                {[
                                    { val: null, label: 'Her Zaman' },
                                    { val: 1,    label: '1 Saat' },
                                    { val: 2,    label: '2 Saat' },
                                    { val: 3,    label: '3 Saat' },
                                    { val: 6,    label: '6 Saat' },
                                    { val: 12,   label: '12 Saat' },
                                    { val: 24,   label: '24 Saat' },
                                    { val: 48,   label: '48 Saat' },
                                    { val: 72,   label: '72 Saat' },
                                    { val: -1,   label: 'Asla' },
                                ].map(opt => {
                                    const isActive = pol.current === opt.val;
                                    return (
                                        <TouchableOpacity key={String(opt.val)} disabled={savingPolicy}
                                            onPress={() => handleSavePolicy(pol.field, opt.val)}
                                            style={{
                                                paddingHorizontal: 11, paddingVertical: 7,
                                                borderRadius: 8, borderWidth: 1.5,
                                                borderColor: isActive ? BIZ_COLOR + '80' : '#ffffff15',
                                                backgroundColor: isActive ? BIZ_COLOR + '18' : 'transparent',
                                            }}>
                                            <Text style={{ color: isActive ? BIZ_LIGHT : '#888', fontSize: 12, fontWeight: isActive ? '700' : '400' }}>
                                                {opt.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            {/* Manuel saat girişi */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <TextInput
                                    style={{ flex: 1, backgroundColor: '#ffffff0a', borderRadius: 8, paddingHorizontal: 12,
                                        paddingVertical: 7, color: '#fff', fontSize: 14, borderWidth: 1,
                                        borderColor: isCustom ? BIZ_COLOR + '60' : '#ffffff15' }}
                                    placeholder="Özel saat (ör: 36)"
                                    placeholderTextColor="#444"
                                    keyboardType="number-pad"
                                    value={isCustom ? String(pol.current) : customPolicyHour}
                                    onChangeText={setCustomPolicyHour}
                                    returnKeyType="done"
                                    onSubmitEditing={() => {
                                        const h = parseInt(customPolicyHour);
                                        if (!isNaN(h) && h > 0) { handleSavePolicy(pol.field, h); setCustomPolicyHour(''); }
                                    }}
                                />
                                <TouchableOpacity disabled={savingPolicy}
                                    onPress={() => {
                                        const h = parseInt(customPolicyHour);
                                        if (!isNaN(h) && h > 0) { handleSavePolicy(pol.field, h); setCustomPolicyHour(''); }
                                        else Alert.alert('Hata', 'Geçerli bir saat sayısı girin');
                                    }}
                                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
                                        backgroundColor: BIZ_COLOR + '28', borderWidth: 1, borderColor: BIZ_COLOR + '44' }}>
                                    <Text style={{ color: BIZ_LIGHT, fontWeight: '700', fontSize: 13 }}>Uygula</Text>
                                </TouchableOpacity>
                            </View>
                            {isCustom && (
                                <Text style={{ color: BIZ_COLOR + 'cc', fontSize: 11, marginTop: 5 }}>
                                    ✓ Aktif: {pol.current} saat öncesine kadar
                                </Text>
                            )}
                        </View>
                        );
                    })}
                    {savingPolicy && <ActivityIndicator color={BIZ_COLOR} size="small" />}

                    {/* ── Ödeme Yöntemleri (PRO) ── */}
                    {isPro && (
                        <>
                            <View style={{ height: 1, backgroundColor: '#ffffff10', marginVertical: 20 }} />
                            <Text style={{ color: '#666', fontSize: 11, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 }}>
                                ÖDEME YÖNTEMLERİ
                            </Text>
                            <Text style={{ color: '#555', fontSize: 11, marginBottom: 10, lineHeight: 16 }}>
                                Hangi ödeme yöntemlerini kabul ediyorsunuz? Kullanıcılar yalnızca seçili yöntemlerle rezervasyon yapabilir.
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {[
                                    { key: 'CASH',   label: '💵 Nakit / Kortta' },
                                    { key: 'EFT',    label: '🏦 EFT / Havale' },
                                    { key: 'ONLINE', label: '💳 Online Ödeme' },
                                ].map(m => {
                                    const isActive = localAcceptedPayments.includes(m.key);
                                    return (
                                        <TouchableOpacity key={m.key} disabled={savingPayments}
                                            onPress={() => handleTogglePayment(m.key)}
                                            style={{
                                                paddingHorizontal: 12, paddingVertical: 8,
                                                borderRadius: 8, borderWidth: 1.5,
                                                borderColor: isActive ? BIZ_COLOR + '80' : '#ffffff15',
                                                backgroundColor: isActive ? BIZ_COLOR + '18' : 'transparent',
                                            }}>
                                            <Text style={{ color: isActive ? BIZ_LIGHT : '#888', fontSize: 13, fontWeight: isActive ? '700' : '400' }}>
                                                {m.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            {savingPayments && <ActivityIndicator color={BIZ_COLOR} size="small" style={{ marginTop: 8 }} />}
                        </>
                    )}
                </View>
            )}

            <VenueScheduleModal
                visible={scheduleOpen}
                venue={venue}
                onClose={() => setScheduleOpen(false)}
                onUserPress={(user) => {
                    setScheduleOpen(false);
                    navigation?.navigate('Profile', { userId: user.id });
                }}
            />
            <VenueAnalyticsModal
                visible={analyticsOpen}
                venue={venue}
                onClose={() => setAnalyticsOpen(false)}
            />
        </View>
    );
}

// ── Ana Ekran ─────────────────────────────────────────────────────────────────
export default function BusinessHomeScreen({ navigation, route }) {
    const dispatch = useDispatch();
    const user     = useSelector(s => s.auth.user);

    const [sub,            setSub]            = useState(null);
    const [pendingRequest, setPendingRequest] = useState(null);
    const [venues,         setVenues]         = useState([]);
    const [iban,           setIban]           = useState(user?.businessIban || null);
    const [ibanHolder,     setIbanHolder]     = useState(user?.businessIbanHolder || null);
    const [loading,        setLoading]        = useState(true);
    const [subModal,       setSubModal]       = useState(false);
    const [venueModal,     setVenueModal]     = useState(false);
    const [cancelling,     setCancelling]     = useState(false);
    const [submitting,     setSubmitting]     = useState(false);
    const [uploading,      setUploading]      = useState(false);

    const fetchAll = useCallback(async () => {
        try {
            const [subRes, venueRes] = await Promise.all([
                api.get('/subscriptions/me'),
                api.get('/venues/mine'),
            ]);
            setSub(subRes.data.subscription);
            setPendingRequest(subRes.data.pendingRequest);
            setVenues(venueRes.data);
        } catch (e) {
            console.error('Fetch hatası', e?.message);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    useEffect(() => {
        if (route?.params?.openReservations && venues.length > 0) {
            setScheduleOpen(true);
            if (!resLoaded) loadReservations();
        }
    }, [route?.params?.openReservations, venues.length]);

    const handlePurchase = async (packageType) => {
        setSubmitting(true);
        try {
            const { data } = await api.post('/subscriptions/request', { packageType });
            setPendingRequest(data.request);
            setSubModal(false);
            Alert.alert('✅ Talep Gönderildi', 'Ödeme bildiriminiz alındı. Admin onayladığında paketiniz aktif edilecek.');
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Gönderilemedi');
        } finally { setSubmitting(false); }
    };

    const handleUploadReceipt = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('İzin Gerekli', 'Galeriye erişim izni vermeniz gerekiyor.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
        if (result.canceled || !result.assets?.[0]) return;
        setUploading(true);
        try {
            const uri = result.assets[0].uri;
            const ext = uri.split('.').pop() || 'jpg';
            const form = new FormData();
            form.append('file', { uri, name: `dekont.${ext}`, type: `image/${ext}` });
            const { data: upload } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            const { data } = await api.patch('/subscriptions/request/receipt', { receiptUrl: upload.url });
            setPendingRequest(data.request);
            Alert.alert('✅ Dekont Yüklendi', 'Dekontunuz admin tarafından görüntülenebilir.');
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Yüklenemedi');
        } finally { setUploading(false); }
    };

    const handleCancelSub = () => {
        Alert.alert('Aboneliği İptal Et', 'Aboneliğinizi iptal etmek istediğinize emin misiniz?', [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'İptal Et', style: 'destructive', onPress: async () => {
                setCancelling(true);
                try { await api.delete('/subscriptions/cancel'); setSub(null); }
                catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'İptal edilemedi'); }
                finally { setCancelling(false); }
            }},
        ]);
    };

    const handleSaveIban = async (ibanVal, holderVal) => {
        const { data } = await api.patch('/venues/iban', { businessIban: ibanVal, businessIbanHolder: holderVal });
        setIban(data.businessIban);
        setIbanHolder(data.businessIbanHolder);
    };

    const handleLogout = () => {
        Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istiyor musunuz?', [
            { text: 'İptal', style: 'cancel' },
            { text: 'Çıkış', style: 'destructive', onPress: () => dispatch(logout()) },
        ]);
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />

            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity style={s.subBtn} onPress={() => setSubModal(true)} activeOpacity={0.8}>
                    <Text style={s.subBtnText}>📋 Abonelikler</Text>
                    {sub && <View style={s.activeDot} />}
                </TouchableOpacity>
                <View style={s.headerCenter}>
                    <Text style={s.headerBadge}>🏢 İŞLETME HESABI</Text>
                </View>
                <View style={s.rightBtns}>
                    <TouchableOpacity
                        onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('App')}
                        style={s.backAppBtn}>
                        <Text style={s.backAppBtnText}>‹ Uygulamaya Dön</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
                        <Text style={s.logoutText}>Çıkış</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {loading ? (
                <View style={s.loadingWrap}><ActivityIndicator size="large" color={BIZ_COLOR} /></View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
                    {/* Abonelik durum özeti */}
                    <View style={s.statusBox}>
                        <Text style={s.statusText}>
                            {sub
                                ? `✅ ${PACKAGES.find(p => p.key === sub.packageType)?.name || sub.packageType} aktif.`
                                : pendingRequest
                                    ? '⏳ Abonelik onayı bekleniyor.'
                                    : '⚠️ Aktif abonelik yok — tesis eklemek için abonelik gereklidir.'}
                        </Text>
                        {!sub && !pendingRequest && (
                            <TouchableOpacity onPress={() => setSubModal(true)} style={s.statusBtn}>
                                <Text style={s.statusBtnText}>Paketi Satın Al</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* IBAN */}
                    <IbanCard iban={iban} ibanHolder={ibanHolder} onSave={handleSaveIban} />

                    {/* Tesisler */}
                    <View style={s.sectionHeader}>
                        <Text style={s.sectionTitle}>🏟️ Tesislerim</Text>
                        {sub && ['RAHATLATICI','PRO','PREMIUM'].includes(sub.packageType) && (
                            <TouchableOpacity style={s.addVenueBtn} onPress={() => setVenueModal(true)} activeOpacity={0.8}>
                                <Text style={s.addVenueBtnText}>+ Tesis Ekle</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {venues.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Text style={s.emptyIcon}>🏟️</Text>
                            <Text style={s.emptyText}>{sub ? (
                                    ['RAHATLATICI','PRO','PREMIUM'].includes(sub.packageType)
                                        ? 'Henüz tesis eklenmedi.' : 'Tesis eklemek için Rahatlatıcı veya üstü paket gereklidir.')
                                    : 'Tesis eklemek için önce abonelik alın.'}</Text>
                            {sub && ['RAHATLATICI','PRO','PREMIUM'].includes(sub.packageType) && (
                                <TouchableOpacity style={s.addVenueBtnLg} onPress={() => setVenueModal(true)} activeOpacity={0.8}>
                                    <Text style={s.addVenueBtnText}>+ Tesis / Kort Ekle</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : (
                        venues.map(v => (
                            <VenueCard key={v.id} venue={v} sub={sub} navigation={navigation} onDelete={id => setVenues(prev => prev.filter(x => x.id !== id))} />
                        ))
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            )}

            <SubscriptionModal
                visible={subModal}
                onClose={() => setSubModal(false)}
                sub={sub}
                pendingRequest={pendingRequest}
                onPurchase={handlePurchase}
                onCancel={handleCancelSub}
                cancelling={cancelling}
                submitting={submitting}
                uploading={uploading}
                onUploadReceipt={handleUploadReceipt}
                username={user?.username}
            />

            <VenueAddModal
                visible={venueModal}
                onClose={() => setVenueModal(false)}
                onSuccess={fetchAll}
            />
        </View>
    );
}

// ── Stiller ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root:        { flex: 1, backgroundColor: colors.bg },
    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll:      { paddingHorizontal: 16, paddingBottom: 16 },

    header:       { backgroundColor: colors.surface, paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, borderColor: BIZ_COLOR + '30', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerBadge:  { color: BIZ_COLOR, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },
    headerBiz:    { color: '#fff', fontSize: 14, fontWeight: '900', textAlign: 'center' },
    subBtn:       { flexDirection: 'row', alignItems: 'center', backgroundColor: BIZ_DIM, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: BIZ_COLOR + '40', gap: 4 },
    subBtnText:   { color: BIZ_LIGHT, fontSize: 11, fontWeight: '800' },
    activeDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
    rightBtns:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backAppBtn:   { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
    backAppBtnText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    logoutBtn:    { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#ef444440', backgroundColor: '#ef444410' },
    logoutText:   { color: '#f87171', fontSize: 11, fontWeight: '700' },

    statusBox:    { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginTop: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
    statusText:   { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
    statusBtn:    { marginTop: 10, backgroundColor: BIZ_COLOR, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
    statusBtnText:{ color: '#000', fontWeight: '900', fontSize: 13 },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 10 },
    sectionTitle:  { color: '#fff', fontSize: 15, fontWeight: '900' },
    addVenueBtn:   { backgroundColor: BIZ_COLOR, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
    addVenueBtnLg: { marginTop: 14, backgroundColor: BIZ_COLOR, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 20 },
    addVenueBtnText:{ color: '#000', fontWeight: '900', fontSize: 13 },

    emptyBox:  { backgroundColor: colors.surface, borderRadius: 16, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
});

const ms = StyleSheet.create({
    overlay:  { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
    sheet:    { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24, maxHeight: '90%' },
    handle:   { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    subHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    subTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
    closeBtn: { color: colors.textMuted, fontSize: 18, paddingHorizontal: 4 },
});

const m = StyleSheet.create({
    divider:       { height: 1, backgroundColor: colors.border, marginVertical: 12 },
    featureRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 8 },
    featureCheck:  { color: BIZ_COLOR, fontSize: 14, fontWeight: '900', marginTop: 1 },
    featureText:   { color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 19 },

    // Aktif abonelik
    activeCard:     { backgroundColor: colors.surface2, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#22c55e40' },
    activeHeader:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
    activeIcon:     { fontSize: 26 },
    activeTitle:    { color: '#4ade80', fontSize: 15, fontWeight: '900' },
    activeSub:      { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    activeBadge:    { backgroundColor: '#22c55e20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#22c55e40' },
    activeBadgeText:{ color: '#4ade80', fontSize: 10, fontWeight: '900' },
    cancelBtn:      { borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#ef444440', backgroundColor: '#ef444410' },
    cancelBtnText:  { color: '#f87171', fontWeight: '700', fontSize: 14 },

    // Bekleyen
    pendingCard:  { backgroundColor: colors.surface2, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#eab30840', alignItems: 'center' },
    pendingIcon:  { fontSize: 36, marginBottom: 8 },
    pendingTitle: { color: BIZ_LIGHT, fontSize: 16, fontWeight: '900', marginBottom: 8 },
    pendingDesc:  { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 12 },
    receiptLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6, alignSelf: 'flex-start' },
    receiptHint:  { color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center', marginBottom: 10 },
    receiptThumb: { width: '100%', height: 140, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
    uploadBtn:    { backgroundColor: BIZ_COLOR, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, alignItems: 'center' },
    uploadBtnText:{ color: '#000', fontWeight: '900', fontSize: 13 },

    // Paket seçim listesi
    pkgSelectTitle:    { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 12 },
    pkgSelectCard:     { backgroundColor: colors.surface2, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    pkgSelectCardActive:{ borderColor: BIZ_COLOR, backgroundColor: BIZ_COLOR + '12' },
    pkgSelectRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    pkgSelectPrice:    { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    pkgSelectCheck:    { color: BIZ_COLOR, fontSize: 18, fontWeight: '900' },
    pkgContinueBtn:    { backgroundColor: BIZ_COLOR, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
    pkgContinueBtnText:{ color: '#000', fontWeight: '900', fontSize: 15 },

    // Paket kartı (satın al)
    pkgCard:      { backgroundColor: colors.surface2, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BIZ_COLOR + '40' },
    pkgIcon:      { fontSize: 28, marginBottom: 6 },
    pkgName:      { color: BIZ_LIGHT, fontSize: 17, fontWeight: '900', marginBottom: 4 },
    pkgPriceRow:  { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
    pkgPrice:     { color: BIZ_LIGHT, fontSize: 30, fontWeight: '900' },
    pkgPeriod:    { color: colors.textMuted, fontSize: 14, marginBottom: 4, marginLeft: 4 },

    payTitle:       { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 14, marginBottom: 10 },
    payOption:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: BIZ_COLOR + '40' },
    payOptionDisabled:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, opacity: 0.5 },
    optionLeft:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
    payIcon:        { fontSize: 22 },
    payLabel:       { color: '#fff', fontSize: 14, fontWeight: '800' },
    payLabelOff:    { color: colors.textSecondary, fontSize: 14, fontWeight: '800' },
    payDesc:        { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    arrow:          { color: BIZ_COLOR, fontSize: 22, fontWeight: '900' },
    soonBadge:      { backgroundColor: '#374151', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    soonText:       { color: colors.textMuted, fontSize: 10, fontWeight: '700' },

    // EFT adımı
    backRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    backArrow:    { color: BIZ_COLOR, fontSize: 20, fontWeight: '900', marginRight: 4 },
    backLabel:    { color: BIZ_COLOR, fontSize: 13, fontWeight: '700' },
    infoBox:      { backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: 'hidden' },
    infoRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
    infoLabel:    { color: colors.textMuted, fontSize: 12, fontWeight: '700', flex: 1 },
    infoValue:    { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'right', flex: 2 },
    noteBox:      { backgroundColor: '#22c55e10', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#22c55e30', marginBottom: 14 },
    noteText:     { color: colors.textSecondary, fontSize: 12, lineHeight: 19 },
    eftBtnRow:    { flexDirection: 'row', gap: 8 },
    laterBtn:     { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
    laterBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
    doneBtn:      { flex: 2, backgroundColor: BIZ_COLOR, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    doneBtnText:  { color: '#000', fontWeight: '900', fontSize: 13 },
});

const ic = StyleSheet.create({
    card:         { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
    row:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    title:        { color: '#fff', fontSize: 14, fontWeight: '800' },
    editBtn:      { color: BIZ_COLOR, fontSize: 13, fontWeight: '700' },
    empty:        { color: colors.textMuted, fontSize: 13, marginBottom: 4 },
    hint:         { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 8 },
    fieldLabel:   { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
    input:        { backgroundColor: colors.bg, borderRadius: 10, padding: 12, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
    btns:         { flexDirection: 'row', gap: 8 },
    cancelBtn:    { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    cancelBtnText:{ color: colors.textMuted, fontWeight: '700', fontSize: 13 },
    saveBtn:      { flex: 2, backgroundColor: BIZ_COLOR, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    saveBtnText:  { color: '#000', fontWeight: '900', fontSize: 13 },
    dataRow:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderColor: colors.border },
    dataLabel:    { color: colors.textMuted, fontSize: 12, fontWeight: '700', flex: 1 },
    dataValue:    { color: '#fff', fontSize: 13, fontWeight: '700', flex: 2, textAlign: 'right' },
    dataValueMono:{ color: '#fff', fontSize: 12, fontWeight: '700', flex: 2, textAlign: 'right', letterSpacing: 0.5 },
});

const vc = StyleSheet.create({
    card:      { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
    header:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
    name:      { color: '#fff', fontSize: 15, fontWeight: '900' },
    meta:      { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    badge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    noteBox:   { backgroundColor: '#ef444410', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#ef444430' },
    noteText:  { color: '#f87171', fontSize: 12, lineHeight: 17 },
    infoRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    infoItem:  { color: colors.textSecondary, fontSize: 12, backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    deleteBtn:    { borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ef444440', backgroundColor: '#ef444410', marginTop: 8 },
    deleteBtnText:{ color: '#f87171', fontWeight: '700', fontSize: 13 },
    tab:          { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
    tabActive:    { backgroundColor: BIZ_COLOR + '20', borderColor: BIZ_COLOR + '60' },
    tabTxt:       { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    tabTxtActive: { color: BIZ_LIGHT },
    panel:        { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    emptyTxt:     { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 8 },
    blockBtn:     { backgroundColor: BIZ_COLOR, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' },
    blockBtnTxt:  { color: '#000', fontWeight: '800', fontSize: 13 },
    blockRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    blockUser:    { color: '#fff', fontSize: 13, fontWeight: '600' },
    catBtn:       { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
    catBtnActive: { borderColor: BIZ_COLOR + '60', backgroundColor: BIZ_COLOR + '15' },
    catBtnTxt:    { color: colors.textMuted, fontSize: 12 },
    menuRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    orderCard:       { backgroundColor: colors.bg, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    orderBtn:        { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#22c55e40', backgroundColor: '#22c55e10', alignItems: 'center' },
    orderBtnTxt:     { color: '#22c55e', fontSize: 12, fontWeight: '700' },
    scheduleBtn:     { backgroundColor: BIZ_COLOR + '18', borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: BIZ_COLOR + '50', marginBottom: 12 },
    scheduleBtnTxt:  { color: BIZ_LIGHT, fontWeight: '800', fontSize: 14 },
    resFilterBtn:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
    resFilterBtnActive: { borderColor: BIZ_COLOR + '60', backgroundColor: BIZ_COLOR + '15' },
    resFilterTxt:    { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
    resFilterTxtActive: { color: BIZ_LIGHT },
    resCourtName:    { color: BIZ_LIGHT, fontSize: 13, fontWeight: '800', marginBottom: 6 },
    resCard:         { backgroundColor: colors.bg, borderRadius: 10, padding: 11, marginBottom: 7, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 },
    resTime:         { color: '#fff', fontSize: 13, fontWeight: '700' },
    resUser:         { color: '#60a5fa', fontSize: 12, marginTop: 2 },
    resMeta:         { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    resCancelBtn:    { backgroundColor: '#ef444415', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#ef444440' },
    resCancelTxt:    { color: '#f87171', fontSize: 12, fontWeight: '700' },
    settingCard:     { backgroundColor: '#ffffff07', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: '#ffffff12' },
    settingCardActive: { borderColor: BIZ_COLOR + '70', backgroundColor: BIZ_COLOR + '10' },
    radio:           { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#555', marginTop: 1, alignItems: 'center', justifyContent: 'center' },
    radioActive:     { borderColor: BIZ_COLOR },
    radioDot:        { width: 10, height: 10, borderRadius: 5, backgroundColor: BIZ_COLOR },
});

const va = StyleSheet.create({
    stepTitle:  { color: BIZ_LIGHT, fontSize: 14, fontWeight: '900', marginBottom: 14 },
    label:      { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 4 },
    hint:       { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 14 },
    input:      { backgroundColor: colors.bg, borderRadius: 10, padding: 13, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
    timeRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    timeBox:    { flex: 1 },
    timeLabel:  { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
    timeInput:  { backgroundColor: colors.bg, borderRadius: 10, padding: 13, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: colors.border, textAlign: 'center', fontFamily: 'monospace' },
    timeSep:    { color: colors.textMuted, fontSize: 20, fontWeight: '900', marginTop: 16 },
    daysRow:    { flexDirection: 'row', gap: 6, marginBottom: 16 },
    dayBtn:     { flex: 1, backgroundColor: colors.bg, borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    dayBtnActive:{ backgroundColor: BIZ_COLOR, borderColor: BIZ_COLOR },
    dayBtnText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
    dayBtnTextActive: { color: '#000' },
    slotBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    slotBtnActive: { backgroundColor: BIZ_COLOR, borderColor: BIZ_COLOR },
    slotBtnLabel:  { color: '#fff', fontSize: 14, fontWeight: '800' },
    slotBtnDesc:   { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    slotCheck:     { color: '#000', fontSize: 16, fontWeight: '900' },
    courtRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    courtInput: { flex: 1, backgroundColor: colors.bg, borderRadius: 10, padding: 12, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: colors.border },
    removeBtn:  { backgroundColor: '#ef444420', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#ef444440' },
    removeBtnText: { color: '#f87171', fontWeight: '900', fontSize: 14 },
    addCourtBtn:   { backgroundColor: colors.bg, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: BIZ_COLOR + '60', borderStyle: 'dashed', marginBottom: 16 },
    addCourtBtnText: { color: BIZ_COLOR, fontWeight: '800', fontSize: 13 },
    rowBtns:    { flexDirection: 'row', gap: 10, marginTop: 4 },
    backBtn:    { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
    backBtnText:{ color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
    nextBtn:    { backgroundColor: BIZ_COLOR, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
    nextBtn2:   { flex: 2, backgroundColor: BIZ_COLOR, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    nextBtnText:{ color: '#000', fontWeight: '900', fontSize: 14 },
});
