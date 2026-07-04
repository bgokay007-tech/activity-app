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
            'Gelişmiş istatistikler',
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
        } catch { Alert.alert('Hata', 'IBAN kaydedilemedi'); }
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

// ── Venue Schedule Modal ──────────────────────────────────────────────────────

const SLOT_STATUS_COLOR = { FREE: '#22c55e', PENDING: '#f59e0b', CONFIRMED: '#ef4444' };
const SLOT_STATUS_BG    = { FREE: '#22c55e12', PENDING: '#f59e0b12', CONFIRMED: '#ef444412' };
const SLOT_STATUS_LABEL = { FREE: 'Müsait', PENDING: 'Bekliyor (EFT)', CONFIRMED: 'Rezerveli' };

const TIME_COL_W  = 72;
const COURT_COL_W = 62;

function VenueScheduleModal({ visible, venue, onClose }) {
    const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const [selDate, setSelDate]   = useState(() => toDateStr(new Date()));
    const [schedule, setSchedule] = useState(null);
    const [loading, setLoading]   = useState(false);

    const shiftDate = (n) => {
        const d = new Date(selDate + 'T12:00:00');
        d.setDate(d.getDate() + n);
        setSelDate(toDateStr(d));
    };
    const fmtDate = (str) => new Date(str + 'T12:00:00').toLocaleDateString('tr-TR',
        { weekday: 'long', day: 'numeric', month: 'long' });

    useEffect(() => {
        if (!visible || !venue?.id) return;
        setLoading(true);
        api.get(`/venues/${venue.id}/schedule?date=${selDate}`)
            .then(r => setSchedule(r.data))
            .catch(() => setSchedule(null))
            .finally(() => setLoading(false));
    }, [visible, venue?.id, selDate]);

    // Build unified time axis from first court's slots
    const courts   = schedule?.courts || [];
    const timeAxis = courts[0]?.slots || [];

    // Lookup helper: get slot status for a given court + row index
    const getCell = (courtId, idx) =>
        schedule?.courts?.find(c => c.courtId === courtId)?.slots?.[idx] || null;

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
                            /* Outer vertical scroll */
                            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                                {/* Inner horizontal scroll (for many courts) */}
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View>
                                        {/* Header row: time label + court names */}
                                        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ffffff18' }}>
                                            <View style={{ width: TIME_COL_W, padding: 10, justifyContent: 'center' }}>
                                                <Text style={{ color: '#666', fontSize: 11, fontWeight: '700' }}>SAAT</Text>
                                            </View>
                                            {courts.map(c => (
                                                <View key={c.courtId} style={{ width: COURT_COL_W, padding: 10,
                                                    alignItems: 'center', justifyContent: 'center',
                                                    borderLeftWidth: 1, borderLeftColor: '#ffffff10' }}>
                                                    <Text style={{ color: BIZ_LIGHT, fontSize: 12, fontWeight: '800', textAlign: 'center' }}>
                                                        {c.courtName}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>

                                        {/* Data rows: one per time slot */}
                                        {timeAxis.map((slot, rowIdx) => (
                                            <View key={rowIdx} style={{ flexDirection: 'row',
                                                borderBottomWidth: 1, borderBottomColor: '#ffffff08' }}>
                                                {/* Time label */}
                                                <View style={{ width: TIME_COL_W, paddingVertical: 12, paddingLeft: 8, paddingRight: 3,
                                                    justifyContent: 'center', backgroundColor: '#ffffff05' }}>
                                                    <Text style={{ color: '#ddd', fontSize: 12, fontWeight: '700' }}>{slot.start}</Text>
                                                    <Text style={{ color: '#666', fontSize: 10, marginTop: 1 }}>– {slot.end}</Text>
                                                </View>

                                                {/* Court cells */}
                                                {courts.map(c => {
                                                    const cell = getCell(c.courtId, rowIdx);
                                                    const st = cell?.status || 'FREE';
                                                    return (
                                                        <View key={c.courtId} style={{
                                                            width: COURT_COL_W,
                                                            paddingVertical: 10, paddingHorizontal: 8,
                                                            backgroundColor: SLOT_STATUS_BG[st],
                                                            borderLeftWidth: 1, borderLeftColor: '#ffffff10',
                                                            justifyContent: 'center', alignItems: 'center',
                                                        }}>
                                                            <View style={{ width: 28, height: 28, borderRadius: 14,
                                                                backgroundColor: SLOT_STATUS_COLOR[st] + '30',
                                                                borderWidth: 1.5, borderColor: SLOT_STATUS_COLOR[st],
                                                                alignItems: 'center', justifyContent: 'center',
                                                                marginBottom: cell?.user ? 4 : 0 }}>
                                                                <Text style={{ fontSize: 12 }}>
                                                                    {st === 'FREE' ? '✓' : st === 'PENDING' ? '⏳' : '●'}
                                                                </Text>
                                                            </View>
                                                            {cell?.user && (
                                                                <Text style={{ color: '#60a5fa', fontSize: 10, textAlign: 'center' }}
                                                                    numberOfLines={1}>
                                                                    @{cell.user.username}
                                                                </Text>
                                                            )}
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        ))}
                                        <View style={{ height: 32 }} />
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

function VenueCard({ venue, sub, onDelete }) {
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
    const [scheduleOpen, setScheduleOpen]   = useState(false);

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
        isApproved ? { key: 'blocks',       label: '🚫 Engel' } : null,
        isApproved && isPro ? { key: 'menu',   label: '📋 Menü' }   : null,
        isApproved && isPro ? { key: 'orders', label: '🛒 Sipariş' } : null,
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

            {activeTab === 'info' && (
                <>
                    <View style={vc.infoRow}>
                        <Text style={vc.infoItem}>🏟️ {venue.courts?.length || 0} kort</Text>
                        <Text style={vc.infoItem}>⏰ {venue.openTime}–{venue.closeTime}</Text>
                        <Text style={vc.infoItem}>📅 {slotLabel}</Text>
                    </View>
                    <TouchableOpacity style={vc.deleteBtn} onPress={handleDelete} disabled={deleting} activeOpacity={0.8}>
                        {deleting ? <ActivityIndicator size="small" color="#f87171" /> : <Text style={vc.deleteBtnText}>Tesisi Sil</Text>}
                    </TouchableOpacity>
                </>
            )}

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

            {activeTab === 'reservations' && (
                <View style={vc.panel}>
                    <TouchableOpacity style={vc.scheduleBtn} onPress={() => setScheduleOpen(true)}>
                        <Text style={vc.scheduleBtnTxt}>📅 Takvimi Görüntüle</Text>
                    </TouchableOpacity>
                    {/* Quick today list */}
                    {reservations.filter(r => r.date === new Date().toISOString().slice(0,10) && r.status !== 'CANCELLED').map(r => (
                        <View key={r.id} style={vc.resCard}>
                            <View style={{ flex: 1 }}>
                                <Text style={vc.resTime}>{r.court?.name}  {r.startTime}–{r.endTime}</Text>
                                <Text style={vc.resUser}>@{r.user?.username || '—'}</Text>
                                <Text style={vc.resMeta}>{r.paymentMethod === 'EFT' ? '🏦 EFT' : '💵 Kortta Öde'}{r.status === 'PENDING' ? '  · ⏳ Onay Bekleniyor' : ''}</Text>
                            </View>
                            <TouchableOpacity style={vc.resCancelBtn}
                                onPress={() => Alert.alert('İptal Et', `${r.user?.username} kişisinin rezervasyonu iptal edilsin mi?`, [
                                    { text: 'Vazgeç', style: 'cancel' },
                                    { text: 'İptal Et', style: 'destructive', onPress: () => handleCancelReservation(r.id) },
                                ])}>
                                <Text style={vc.resCancelTxt}>İptal</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                    {resLoaded && reservations.filter(r => r.date === new Date().toISOString().slice(0,10) && r.status !== 'CANCELLED').length === 0 && (
                        <Text style={vc.emptyTxt}>Bugün rezervasyon yok</Text>
                    )}
                </View>
            )}

            <VenueScheduleModal
                visible={scheduleOpen}
                venue={venue}
                onClose={() => setScheduleOpen(false)}
            />
        </View>
    );
}

// ── Ana Ekran ─────────────────────────────────────────────────────────────────
export default function BusinessHomeScreen({ navigation }) {
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
                            <VenueCard key={v.id} venue={v} sub={sub} onDelete={id => setVenues(prev => prev.filter(x => x.id !== id))} />
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
