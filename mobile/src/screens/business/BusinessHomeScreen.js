import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    StatusBar, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../store/slices/authSlice';
import api from '../../services/api';
import colors from '../../theme/colors';

const BIZ_COLOR = '#f59e0b';
const BIZ_LIGHT = '#fbbf24';
const BIZ_DIM   = '#f59e0b18';

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

function SubscriptionActiveCard({ sub, onCancel, cancelling }) {
    const endDate = new Date(sub.endDate);
    const now     = new Date();
    const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

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

            <Text style={s.activeFeatureTitle}>Sahip olduğun özellikler:</Text>
            {STARTER_PACKAGE.features.map((f, i) => (
                <View key={i} style={s.featureRow}>
                    <Text style={s.featureCheck}>✓</Text>
                    <Text style={s.featureText}>{f}</Text>
                </View>
            ))}

            <TouchableOpacity
                style={s.cancelBtn}
                onPress={onCancel}
                disabled={cancelling}
                activeOpacity={0.8}
            >
                {cancelling
                    ? <ActivityIndicator size="small" color="#f87171" />
                    : <Text style={s.cancelBtnText}>Aboneliği İptal Et</Text>
                }
            </TouchableOpacity>
        </View>
    );
}

function PackageCard({ onActivate, activating }) {
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

            <TouchableOpacity
                style={s.activateBtn}
                onPress={onActivate}
                disabled={activating}
                activeOpacity={0.8}
            >
                {activating
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.activateBtnText}>Paketi Aktif Et</Text>
                }
            </TouchableOpacity>
        </View>
    );
}

export default function BusinessHomeScreen() {
    const dispatch  = useDispatch();
    const user      = useSelector(s => s.auth.user);

    const [sub,        setSub]        = useState(null);
    const [loading,    setLoading]    = useState(true);
    const [activating, setActivating] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const fetchSub = useCallback(async () => {
        try {
            const { data } = await api.get('/subscriptions/me');
            setSub(data.subscription);
        } catch (e) {
            console.error('Abonelik alınamadı', e?.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchSub(); }, [fetchSub]);

    const handleActivate = async () => {
        setActivating(true);
        try {
            const { data } = await api.post('/subscriptions/activate', { packageType: 'STARTER' });
            setSub(data.subscription);
            Alert.alert('🏆 Paket Aktif!', 'Başlangıç Paketi başarıyla aktif edildi. Artık turnuva oluşturabilirsiniz.');
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Paket aktif edilemedi.');
        } finally {
            setActivating(false);
        }
    };

    const handleCancel = () => {
        Alert.alert(
            'Aboneliği İptal Et',
            'Aboneliğinizi iptal etmek istediğinize emin misiniz? Süre sonunda turnuva oluşturamazsınız.',
            [
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
            ]
        );
    };

    const handleLogout = () => {
        Alert.alert('Çıkış Yap', 'İşletme hesabından çıkmak istediğinize emin misiniz?', [
            { text: 'İptal', style: 'cancel' },
            { text: 'Çıkış', style: 'destructive', onPress: () => dispatch(logout()) },
        ]);
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
                                ? 'Başlangıç Paketiniz aktif. Turnuva oluşturabilir ve kortlarınızı turnuvaya ekleyebilirsiniz.'
                                : 'Turnuva düzenlemek ve kortlarınızı yönetmek için Başlangıç Paketini aktif edin.'}
                        </Text>
                    </View>

                    <Text style={s.sectionTitle}>📦 Paket</Text>

                    {sub ? (
                        <SubscriptionActiveCard
                            sub={sub}
                            onCancel={handleCancel}
                            cancelling={cancelling}
                        />
                    ) : (
                        <PackageCard
                            onActivate={handleActivate}
                            activating={activating}
                        />
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            )}
        </View>
    );
}

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

    sectionTitle:{ color: '#fff', fontSize: 15, fontWeight: '900', marginBottom: 12 },

    divider:     { height: 1, backgroundColor: colors.border, marginVertical: 12 },

    featureRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 8 },
    featureCheck:{ color: BIZ_COLOR, fontSize: 14, fontWeight: '900', marginTop: 1 },
    featureText: { color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 19 },

    // Paket kartı (aktif değil)
    pkgCard:     { backgroundColor: colors.surface, borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: BIZ_COLOR + '50' },
    pkgIcon:     { fontSize: 32, marginBottom: 8 },
    pkgName:     { color: BIZ_LIGHT, fontSize: 20, fontWeight: '900', marginBottom: 6 },
    pkgPriceRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
    pkgPrice:    { color: BIZ_LIGHT, fontSize: 36, fontWeight: '900' },
    pkgPeriod:   { color: colors.textMuted, fontSize: 15, marginBottom: 6, marginLeft: 4 },

    activateBtn:    { backgroundColor: BIZ_COLOR, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
    activateBtnText:{ color: '#000', fontWeight: '900', fontSize: 15 },

    // Aktif abonelik kartı
    activeCard:       { backgroundColor: colors.surface, borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: '#22c55e50' },
    activeHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
    activeIcon:       { fontSize: 28 },
    activeTitle:      { color: '#4ade80', fontSize: 16, fontWeight: '900' },
    activeSub:        { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    activeBadge:      { backgroundColor: '#22c55e20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#22c55e40' },
    activeBadgeText:  { color: '#4ade80', fontSize: 10, fontWeight: '900' },
    activeFeatureTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8 },

    cancelBtn:    { borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginTop: 6, borderWidth: 1, borderColor: '#ef444440', backgroundColor: '#ef444410' },
    cancelBtnText:{ color: '#f87171', fontWeight: '700', fontSize: 14 },
});
