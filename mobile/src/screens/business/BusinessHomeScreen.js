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

const EFT_INFO = {
    banka:    'Ziraat Bankası',
    iban:     'TR00 0000 0000 0000 0000 0000 00',
    sahip:    'AcTiViTy Teknoloji Ltd. Şti.',
    tutar:    '399,00 TL',
    aciklama: 'Başlangıç Paketi – ',
};

const STARTER_PACKAGE = {
    key: 'STARTER', icon: '🏆', name: 'Başlangıç Paketi', price: '399', period: 'ay',
    features: [
        'Turnuva oluşturma yetkisi',
        'Kortlarını turnuvaya ekleme',
        'Turnuva maçlarına kort atama',
        'Turnuva süresinde kortlar rezervasyona kapanır',
    ],
};

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const SLOT_TYPES = [
    { key: 'FULL_HOUR',  label: 'Tam Saatler',     desc: '1s · 2s · 3s' },
    { key: 'HALF_HOUR',  label: 'Buçuklu Saatler',  desc: '1:30 · 2:30 · 3:30' },
    { key: 'FLEXIBLE',   label: 'Serbest Süre',      desc: 'Min 1s, aralıksız' },
];
const STATUS_COLOR = { PENDING: '#eab308', APPROVED: '#22c55e', REJECTED: '#ef4444' };
const STATUS_LABEL = { PENDING: '⏳ Onay Bekliyor', APPROVED: '✅ Onaylandı', REJECTED: '❌ Reddedildi' };

// ── Abonelik Modalı ──────────────────────────────────────────────────────────
function SubscriptionModal({ visible, onClose, sub, pendingRequest, onPurchase, onCancel, cancelling, submitting, uploading, onUploadReceipt, username }) {
    const [payStep, setPayStep] = useState('select');
    const handlePayClose = () => { setPayStep('select'); };

    const handleEftConfirm = async () => {
        await onPurchase();
        setPayStep('select');
    };

    const renderSubContent = () => {
        if (sub) {
            const endDate  = new Date(sub.endDate);
            const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
            return (
                <View style={m.activeCard}>
                    <View style={m.activeHeader}>
                        <Text style={m.activeIcon}>✅</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={m.activeTitle}>Başlangıç Paketi Aktif</Text>
                            <Text style={m.activeSub}>{daysLeft} gün kaldı · {endDate.toLocaleDateString('tr-TR')}</Text>
                        </View>
                        <View style={m.activeBadge}><Text style={m.activeBadgeText}>AKTİF</Text></View>
                    </View>
                    <View style={m.divider} />
                    {STARTER_PACKAGE.features.map((f, i) => (
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
        // Paket kartı
        if (payStep === 'select') {
            return (
                <View style={m.pkgCard}>
                    <Text style={m.pkgIcon}>{STARTER_PACKAGE.icon}</Text>
                    <Text style={m.pkgName}>{STARTER_PACKAGE.name}</Text>
                    <View style={m.pkgPriceRow}>
                        <Text style={m.pkgPrice}>{STARTER_PACKAGE.price}₺</Text>
                        <Text style={m.pkgPeriod}>/{STARTER_PACKAGE.period}</Text>
                    </View>
                    <View style={m.divider} />
                    {STARTER_PACKAGE.features.map((f, i) => (
                        <View key={i} style={m.featureRow}>
                            <Text style={m.featureCheck}>✓</Text>
                            <Text style={m.featureText}>{f}</Text>
                        </View>
                    ))}

                    <Text style={m.payTitle}>Ödeme Yöntemi Seç</Text>
                    <View style={m.payOptionDisabled}>
                        <View style={m.optionLeft}><Text style={m.payIcon}>💳</Text><View><Text style={m.payLabelOff}>Online Ödeme</Text><Text style={m.payDesc}>Kredi / banka kartı</Text></View></View>
                        <View style={m.soonBadge}><Text style={m.soonText}>Yakında</Text></View>
                    </View>
                    <TouchableOpacity style={m.payOption} onPress={() => setPayStep('eft')} activeOpacity={0.8}>
                        <View style={m.optionLeft}><Text style={m.payIcon}>🏦</Text><View><Text style={m.payLabel}>EFT / Havale</Text><Text style={m.payDesc}>Banka transferi</Text></View></View>
                        <Text style={m.arrow}>›</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        // EFT adımı
        return (
            <View style={m.pkgCard}>
                <TouchableOpacity onPress={handlePayClose} style={m.backRow}>
                    <Text style={m.backArrow}>‹</Text>
                    <Text style={m.backLabel}>Geri</Text>
                </TouchableOpacity>
                <Text style={m.pkgName}>EFT / Havale Bilgileri</Text>
                <View style={m.infoBox}>
                    {[
                        { label: 'Banka', value: EFT_INFO.banka },
                        { label: 'IBAN', value: EFT_INFO.iban },
                        { label: 'Hesap Sahibi', value: EFT_INFO.sahip },
                        { label: 'Tutar', value: EFT_INFO.tutar },
                        { label: 'Açıklama', value: EFT_INFO.aciklama + (username || '') },
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
                    <TouchableOpacity style={m.laterBtn} onPress={handlePayClose} activeOpacity={0.8}>
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
        setForm({ name: '', branch: '', city: '', district: '', address: '', phone: '', openTime: '08:00', closeTime: '22:00', openDays: [1,2,3,4,5,6,7], slotType: 'FULL_HOUR', courts: ['Kort 1'] });
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
                        <View>
                            <Text style={[va.slotBtnLabel, form.slotType === st.key && { color: '#000' }]}>{st.label}</Text>
                            <Text style={[va.slotBtnDesc, form.slotType === st.key && { color: '#00000099' }]}>{st.desc}</Text>
                        </View>
                        {form.slotType === st.key && <Text style={va.slotCheck}>✓</Text>}
                    </TouchableOpacity>
                ))}

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

// ── Tesis Kartı ────────────────────────────────────────────────────────────────
function VenueCard({ venue, onDelete }) {
    const [deleting, setDeleting] = useState(false);
    const statusColor = STATUS_COLOR[venue.status] || '#9ca3af';
    const statusLabel = STATUS_LABEL[venue.status] || venue.status;
    const slotLabel = SLOT_TYPES.find(s => s.key === venue.slotType)?.label || venue.slotType;

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

            {venue.adminNote ? (
                <View style={vc.noteBox}>
                    <Text style={vc.noteText}>📝 {venue.adminNote}</Text>
                </View>
            ) : null}

            <View style={vc.infoRow}>
                <Text style={vc.infoItem}>🏟️ {venue.courts?.length || 0} kort</Text>
                <Text style={vc.infoItem}>⏰ {venue.openTime}–{venue.closeTime}</Text>
                <Text style={vc.infoItem}>📅 {slotLabel}</Text>
            </View>

            <TouchableOpacity style={vc.deleteBtn} onPress={handleDelete} disabled={deleting} activeOpacity={0.8}>
                {deleting ? <ActivityIndicator size="small" color="#f87171" /> : <Text style={vc.deleteBtnText}>Sil</Text>}
            </TouchableOpacity>
        </View>
    );
}

// ── Ana Ekran ─────────────────────────────────────────────────────────────────
export default function BusinessHomeScreen() {
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

    const handlePurchase = async () => {
        setSubmitting(true);
        try {
            const { data } = await api.post('/subscriptions/request', { packageType: 'STARTER' });
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
                    <Text style={s.headerBiz} numberOfLines={1}>{user?.businessName || user?.fullName || 'İşletme'}</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
                    <Text style={s.logoutText}>Çıkış</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={s.loadingWrap}><ActivityIndicator size="large" color={BIZ_COLOR} /></View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
                    {/* Abonelik durum özeti */}
                    <View style={s.statusBox}>
                        <Text style={s.statusText}>
                            {sub
                                ? '✅ Başlangıç Paketi aktif — turnuva oluşturabilirsiniz.'
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
                        {sub && (
                            <TouchableOpacity style={s.addVenueBtn} onPress={() => setVenueModal(true)} activeOpacity={0.8}>
                                <Text style={s.addVenueBtnText}>+ Tesis Ekle</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {venues.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Text style={s.emptyIcon}>🏟️</Text>
                            <Text style={s.emptyText}>{sub ? 'Henüz tesis eklenmedi.' : 'Tesis eklemek için önce abonelik alın.'}</Text>
                            {sub && (
                                <TouchableOpacity style={s.addVenueBtnLg} onPress={() => setVenueModal(true)} activeOpacity={0.8}>
                                    <Text style={s.addVenueBtnText}>+ Tesis / Kort Ekle</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : (
                        venues.map(v => (
                            <VenueCard key={v.id} venue={v} onDelete={id => setVenues(prev => prev.filter(x => x.id !== id))} />
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
    deleteBtn: { borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ef444440', backgroundColor: '#ef444410' },
    deleteBtnText: { color: '#f87171', fontWeight: '700', fontSize: 13 },
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
