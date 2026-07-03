import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    StatusBar, Platform, Alert, ActivityIndicator, Modal, Image,
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
    key: 'STARTER',
    icon: '🏆',
    name: 'Başlangıç Paketi',
    price: '399',
    period: 'ay',
    features: [
        'Turnuva oluşturma yetkisi',
        'Kortlarını turnuvaya ekleme',
        'Turnuva maçlarına kort atama',
        'Turnuva süresinde kortlar rezervasyona kapanır',
    ],
};

// ── Ödeme Yöntemi Modalı ──────────────────────────────────────────────────────
function PaymentModal({ visible, onClose, onEftConfirm, username }) {
    const [step, setStep] = useState('select');

    const handleClose = () => { setStep('select'); onClose(); };
    const handleEftConfirm = () => { setStep('select'); onEftConfirm(); };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
            <View style={m.overlay}>
                <View style={m.sheet}>
                    <View style={m.handle} />

                    {step === 'select' ? (
                        <>
                            <Text style={m.title}>Ödeme Yöntemi Seç</Text>
                            <Text style={m.subtitle}>Başlangıç Paketi · 399 ₺ / ay</Text>

                            {/* Online — kapalı */}
                            <View style={m.optionDisabled}>
                                <View style={m.optionLeft}>
                                    <Text style={m.optionIcon}>💳</Text>
                                    <View>
                                        <Text style={m.optionLabelDisabled}>Online Ödeme</Text>
                                        <Text style={m.optionDesc}>Kredi / banka kartı</Text>
                                    </View>
                                </View>
                                <View style={m.soonBadge}>
                                    <Text style={m.soonText}>Yakında</Text>
                                </View>
                            </View>

                            {/* EFT — aktif */}
                            <TouchableOpacity style={m.option} onPress={() => setStep('eft')} activeOpacity={0.8}>
                                <View style={m.optionLeft}>
                                    <Text style={m.optionIcon}>🏦</Text>
                                    <View>
                                        <Text style={m.optionLabel}>EFT / Havale</Text>
                                        <Text style={m.optionDesc}>Banka transferi</Text>
                                    </View>
                                </View>
                                <Text style={m.arrow}>›</Text>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={handleClose} style={m.cancelBtn}>
                                <Text style={m.cancelText}>Vazgeç</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <TouchableOpacity onPress={() => setStep('select')} style={m.backRow}>
                                <Text style={m.backArrow}>‹</Text>
                                <Text style={m.backLabel}>Geri</Text>
                            </TouchableOpacity>

                            <Text style={m.title}>EFT / Havale Bilgileri</Text>

                            <View style={m.infoBox}>
                                {[
                                    { label: 'Banka',        value: EFT_INFO.banka },
                                    { label: 'IBAN',         value: EFT_INFO.iban  },
                                    { label: 'Hesap Sahibi', value: EFT_INFO.sahip  },
                                    { label: 'Tutar',        value: EFT_INFO.tutar  },
                                    { label: 'Açıklama',     value: EFT_INFO.aciklama + (username || '') },
                                ].map(row => (
                                    <View key={row.label} style={m.infoRow}>
                                        <Text style={m.infoLabel}>{row.label}</Text>
                                        <Text style={m.infoValue} selectable>{row.value}</Text>
                                    </View>
                                ))}
                            </View>

                            <View style={m.noteBox}>
                                <Text style={m.noteText}>
                                    ✅  Açıklamaya kullanıcı adınızı yazmayı unutmayın.{'\n\n'}
                                    📎  Ödemeyi yaptıktan sonra dekontunuzu yükleyerek onay isteği gönderin.
                                </Text>
                            </View>

                            <TouchableOpacity style={m.doneBtn} onPress={handleEftConfirm} activeOpacity={0.8}>
                                <Text style={m.doneBtnText}>Tamam, Ödemeyi Yaptım →</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

// ── Dekont Yükleme Bölümü ─────────────────────────────────────────────────────
function ReceiptSection({ onSubmit, submitting }) {
    const [receiptUri, setReceiptUri] = useState(null);

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('İzin Gerekli', 'Galeriye erişim izni vermeniz gerekiyor.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
        });
        if (!result.canceled && result.assets?.[0]) {
            setReceiptUri(result.assets[0].uri);
        }
    };

    return (
        <View style={s.receiptCard}>
            <Text style={s.receiptTitle}>📎 Dekont Gönder</Text>
            <Text style={s.receiptDesc}>Ödeme dekontunuzu yükleyin. Onaylandıktan sonra paketiniz aktif edilecektir.</Text>

            <TouchableOpacity style={s.pickBtn} onPress={pickImage} activeOpacity={0.8}>
                {receiptUri ? (
                    <Image source={{ uri: receiptUri }} style={s.receiptPreview} resizeMode="cover" />
                ) : (
                    <>
                        <Text style={s.pickIcon}>📷</Text>
                        <Text style={s.pickText}>Dekont Seç</Text>
                    </>
                )}
            </TouchableOpacity>

            {receiptUri && (
                <TouchableOpacity
                    style={[s.submitBtn, submitting && { opacity: 0.6 }]}
                    onPress={() => onSubmit(receiptUri)}
                    disabled={submitting}
                    activeOpacity={0.8}
                >
                    {submitting
                        ? <ActivityIndicator size="small" color="#000" />
                        : <Text style={s.submitBtnText}>Onay İsteği Gönder</Text>
                    }
                </TouchableOpacity>
            )}
        </View>
    );
}

// ── Bekleme Durumu ────────────────────────────────────────────────────────────
function PendingCard({ request }) {
    return (
        <View style={s.pendingCard}>
            <Text style={s.pendingIcon}>⏳</Text>
            <Text style={s.pendingTitle}>Onay Bekleniyor</Text>
            <Text style={s.pendingDesc}>
                Dekontunuz inceleniyor. Onaylandığında bildirim alacaksınız.{'\n\n'}
                Talep tarihi: {new Date(request.createdAt).toLocaleDateString('tr-TR')}
            </Text>
            {request.receiptUrl ? (
                <Image source={{ uri: request.receiptUrl }} style={s.receiptThumb} resizeMode="cover" />
            ) : null}
        </View>
    );
}

// ── Aktif Abonelik Kartı ──────────────────────────────────────────────────────
function SubscriptionActiveCard({ sub, onCancel, cancelling }) {
    const endDate  = new Date(sub.endDate);
    const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));

    return (
        <View style={s.activeCard}>
            <View style={s.activeHeader}>
                <Text style={s.activeIcon}>✅</Text>
                <View style={{ flex: 1 }}>
                    <Text style={s.activeTitle}>Başlangıç Paketi Aktif</Text>
                    <Text style={s.activeSub}>{daysLeft} gün kaldı · {endDate.toLocaleDateString('tr-TR')}</Text>
                </View>
                <View style={s.activeBadge}>
                    <Text style={s.activeBadgeText}>AKTİF</Text>
                </View>
            </View>

            <View style={s.divider} />

            <Text style={s.featureSectionLabel}>Sahip olduğun özellikler:</Text>
            {STARTER_PACKAGE.features.map((f, i) => (
                <View key={i} style={s.featureRow}>
                    <Text style={s.featureCheck}>✓</Text>
                    <Text style={s.featureText}>{f}</Text>
                </View>
            ))}

            <TouchableOpacity style={s.cancelBtn} onPress={onCancel} disabled={cancelling} activeOpacity={0.8}>
                {cancelling
                    ? <ActivityIndicator size="small" color="#f87171" />
                    : <Text style={s.cancelBtnText}>Aboneliği İptal Et</Text>
                }
            </TouchableOpacity>
        </View>
    );
}

// ── Paket Kartı ───────────────────────────────────────────────────────────────
function PackageCard({ onPressActivate }) {
    return (
        <View style={s.pkgCard}>
            <Text style={s.pkgIcon}>{STARTER_PACKAGE.icon}</Text>
            <Text style={s.pkgName}>{STARTER_PACKAGE.name}</Text>
            <View style={s.pkgPriceRow}>
                <Text style={s.pkgPrice}>{STARTER_PACKAGE.price}₺</Text>
                <Text style={s.pkgPeriod}>/{STARTER_PACKAGE.period}</Text>
            </View>
            <View style={s.divider} />
            {STARTER_PACKAGE.features.map((f, i) => (
                <View key={i} style={s.featureRow}>
                    <Text style={s.featureCheck}>✓</Text>
                    <Text style={s.featureText}>{f}</Text>
                </View>
            ))}
            <TouchableOpacity style={s.activateBtn} onPress={onPressActivate} activeOpacity={0.8}>
                <Text style={s.activateBtnText}>Paketi Satın Al</Text>
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
    const [loading,        setLoading]        = useState(true);
    const [cancelling,  setCancelling]  = useState(false);
    const [payModal,    setPayModal]    = useState(false);
    const [submitting,  setSubmitting]  = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const { data } = await api.get('/subscriptions/me');
            setSub(data.subscription);
            setPendingRequest(data.pendingRequest);
        } catch (e) {
            console.error('Durum alınamadı', e?.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    const handleSubmitReceipt = async (uri) => {
        setSubmitting(true);
        try {
            // 1. Görseli yükle
            const form = new FormData();
            const ext  = uri.split('.').pop() || 'jpg';
            form.append('file', { uri, name: `dekont.${ext}`, type: `image/${ext}` });
            const { data: upload } = await api.post('/upload', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            // 2. Talep gönder
            const { data } = await api.post('/subscriptions/request', {
                packageType: 'STARTER',
                receiptUrl: upload.url,
            });

            setPendingRequest(data.request);
            setShowReceipt(false);
            Alert.alert('✅ Gönderildi', 'Dekontunuz alındı. Onaylandığında bildirim alacaksınız.');
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Gönderilemedi, tekrar deneyin.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = () => {
        Alert.alert('Aboneliği İptal Et', 'Aboneliğinizi iptal etmek istediğinize emin misiniz?', [
            { text: 'Vazgeç', style: 'cancel' },
            {
                text: 'İptal Et', style: 'destructive', onPress: async () => {
                    setCancelling(true);
                    try {
                        await api.delete('/subscriptions/cancel');
                        setSub(null);
                    } catch (e) {
                        Alert.alert('Hata', e?.response?.data?.message || 'İptal edilemedi.');
                    } finally {
                        setCancelling(false);
                    }
                },
            },
        ]);
    };

    const handleLogout = () => {
        Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istiyor musunuz?', [
            { text: 'İptal', style: 'cancel' },
            { text: 'Çıkış', style: 'destructive', onPress: () => dispatch(logout()) },
        ]);
    };

    const renderContent = () => {
        if (sub) {
            return <SubscriptionActiveCard sub={sub} onCancel={handleCancel} cancelling={cancelling} />;
        }
        if (pendingRequest) {
            return <PendingCard request={pendingRequest} />;
        }
        return (
            <>
                <PackageCard onPressActivate={() => setPayModal(true)} />
                <View style={{ height: 16 }} />
                <ReceiptSection onSubmit={handleSubmitReceipt} submitting={submitting} />
            </>
        );
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />

            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <View>
                    <Text style={s.headerBadge}>🏢 İŞLETME HESABI</Text>
                    <Text style={s.headerBiz} numberOfLines={1}>
                        {user?.businessName || user?.fullName || 'İşletme'}
                    </Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
                    <Text style={s.logoutText}>Çıkış</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={s.loadingWrap}>
                    <ActivityIndicator size="large" color={BIZ_COLOR} />
                </View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
                    <View style={s.welcomeBox}>
                        <Text style={s.welcomeTitle}>Hoş geldiniz! 👋</Text>
                        <Text style={s.welcomeDesc}>
                            {sub
                                ? 'Başlangıç Paketiniz aktif. Turnuva oluşturabilirsiniz.'
                                : pendingRequest
                                    ? 'Dekontunuz inceleniyor. Onay sonrası paketiniz aktif edilecek.'
                                    : 'Turnuva düzenlemek için Başlangıç Paketini satın alın.'}
                        </Text>
                    </View>

                    <Text style={s.sectionTitle}>📦 Paket</Text>
                    {renderContent()}
                    <View style={{ height: 40 }} />
                </ScrollView>
            )}

            <PaymentModal
                visible={payModal}
                onClose={() => setPayModal(false)}
                onEftConfirm={() => setPayModal(false)}
                username={user?.username}
            />
        </View>
    );
}

// ── Stiller ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root:        { flex: 1, backgroundColor: colors.bg },
    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll:      { paddingHorizontal: 16, paddingBottom: 16 },

    header:      { backgroundColor: colors.surface, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderColor: BIZ_COLOR + '30', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    headerBadge: { color: BIZ_COLOR, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 3 },
    headerBiz:   { color: '#fff', fontSize: 18, fontWeight: '900', maxWidth: 220 },
    logoutBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#ef444440', backgroundColor: '#ef444410' },
    logoutText:  { color: '#f87171', fontSize: 12, fontWeight: '700' },

    welcomeBox:  { backgroundColor: BIZ_DIM, borderRadius: 14, padding: 14, marginTop: 16, marginBottom: 20, borderWidth: 1, borderColor: BIZ_COLOR + '30' },
    welcomeTitle:{ color: BIZ_LIGHT, fontSize: 16, fontWeight: '900', marginBottom: 6 },
    welcomeDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },

    sectionTitle:        { color: '#fff', fontSize: 15, fontWeight: '900', marginBottom: 12 },
    divider:             { height: 1, backgroundColor: colors.border, marginVertical: 12 },
    featureSectionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8 },
    featureRow:          { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 8 },
    featureCheck:        { color: BIZ_COLOR, fontSize: 14, fontWeight: '900', marginTop: 1 },
    featureText:         { color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 19 },

    pkgCard:        { backgroundColor: colors.surface, borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: BIZ_COLOR + '50' },
    pkgIcon:        { fontSize: 32, marginBottom: 8 },
    pkgName:        { color: BIZ_LIGHT, fontSize: 20, fontWeight: '900', marginBottom: 6 },
    pkgPriceRow:    { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
    pkgPrice:       { color: BIZ_LIGHT, fontSize: 36, fontWeight: '900' },
    pkgPeriod:      { color: colors.textMuted, fontSize: 15, marginBottom: 6, marginLeft: 4 },
    activateBtn:    { backgroundColor: BIZ_COLOR, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
    activateBtnText:{ color: '#000', fontWeight: '900', fontSize: 15 },

    receiptCard:    { backgroundColor: colors.surface, borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: BIZ_COLOR + '50' },
    receiptTitle:   { color: BIZ_LIGHT, fontSize: 17, fontWeight: '900', marginBottom: 6 },
    receiptDesc:    { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 16 },
    pickBtn:        { backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', height: 140, justifyContent: 'center', alignItems: 'center', marginBottom: 14, overflow: 'hidden' },
    pickIcon:       { fontSize: 32, marginBottom: 6 },
    pickText:       { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    receiptPreview: { width: '100%', height: '100%' },
    submitBtn:      { backgroundColor: BIZ_COLOR, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    submitBtnText:  { color: '#000', fontWeight: '900', fontSize: 15 },

    pendingCard:  { backgroundColor: colors.surface, borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: '#eab30850', alignItems: 'center' },
    pendingIcon:  { fontSize: 40, marginBottom: 10 },
    pendingTitle: { color: BIZ_LIGHT, fontSize: 18, fontWeight: '900', marginBottom: 8 },
    pendingDesc:  { color: colors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 14 },
    receiptThumb: { width: '100%', height: 160, borderRadius: 10, borderWidth: 1, borderColor: colors.border },

    activeCard:       { backgroundColor: colors.surface, borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: '#22c55e50' },
    activeHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
    activeIcon:       { fontSize: 28 },
    activeTitle:      { color: '#4ade80', fontSize: 16, fontWeight: '900' },
    activeSub:        { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    activeBadge:      { backgroundColor: '#22c55e20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#22c55e40' },
    activeBadgeText:  { color: '#4ade80', fontSize: 10, fontWeight: '900' },
    cancelBtn:        { borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginTop: 6, borderWidth: 1, borderColor: '#ef444440', backgroundColor: '#ef444410' },
    cancelBtnText:    { color: '#f87171', fontWeight: '700', fontSize: 14 },
});

const m = StyleSheet.create({
    overlay:  { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
    sheet:    { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 28 },
    handle:   { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
    title:    { color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 4 },
    subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 20 },

    option:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface2, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: BIZ_COLOR + '40' },
    optionDisabled:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface2, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border, opacity: 0.5 },
    optionLeft:          { flexDirection: 'row', alignItems: 'center', gap: 12 },
    optionIcon:          { fontSize: 24 },
    optionLabel:         { color: '#fff', fontSize: 15, fontWeight: '800' },
    optionLabelDisabled: { color: colors.textSecondary, fontSize: 15, fontWeight: '800' },
    optionDesc:          { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    arrow:               { color: BIZ_COLOR, fontSize: 24, fontWeight: '900' },
    soonBadge:           { backgroundColor: '#374151', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    soonText:            { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    cancelBtn:           { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    cancelText:          { color: colors.textMuted, fontSize: 14, fontWeight: '700' },

    backRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    backArrow: { color: BIZ_COLOR, fontSize: 22, fontWeight: '900', marginRight: 4 },
    backLabel: { color: BIZ_COLOR, fontSize: 14, fontWeight: '700' },

    infoBox:      { backgroundColor: colors.bg, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 14, overflow: 'hidden' },
    infoRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderColor: colors.border },
    infoLabel:    { color: colors.textMuted, fontSize: 12, fontWeight: '700', flex: 1 },
    infoValue:    { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'right', flex: 2 },

    noteBox:     { backgroundColor: '#22c55e10', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#22c55e30', marginBottom: 16 },
    noteText:    { color: colors.textSecondary, fontSize: 12, lineHeight: 20 },
    doneBtn:     { backgroundColor: BIZ_COLOR, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    doneBtnText: { color: '#000', fontWeight: '900', fontSize: 15 },
});
