import { useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    StatusBar, Platform, Alert,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../store/slices/authSlice';
import colors from '../../theme/colors';

const BIZ_COLOR  = '#f59e0b';
const BIZ_LIGHT  = '#fbbf24';
const BIZ_DIM    = '#f59e0b18';

const PACKAGES = [
    {
        key: 'starter',
        icon: '🥉',
        name: 'Başlangıç',
        price: '299',
        period: 'ay',
        tag: null,
        features: [
            '1 kort / saha ilanı',
            'Temel takvim görünümü',
            'Kullanıcı mesajlaşması',
            'Temel istatistikler',
        ],
        cta: 'Başlangıç Seç',
        color: '#94a3b8',
    },
    {
        key: 'pro',
        icon: '🥈',
        name: 'Profesyonel',
        price: '599',
        period: 'ay',
        tag: 'En Popüler',
        features: [
            '3 kort / saha ilanı',
            'Öne çıkarma (haftada 2)',
            'Gelişmiş takvim & rezervasyon',
            'Detaylı doluluk istatistikleri',
            'Öncelikli destek',
        ],
        cta: 'Profesyonel Seç',
        color: BIZ_COLOR,
    },
    {
        key: 'premium',
        icon: '🥇',
        name: 'Premium',
        price: '999',
        period: 'ay',
        tag: null,
        features: [
            'Sınırsız kort / saha ilanı',
            'Sürekli öne çıkarma',
            'Otomatik rezervasyon sistemi',
            'Gelişmiş analitik & raporlar',
            'Öncelikli & özel destek',
            'API erişimi (yakında)',
        ],
        cta: 'Premium Seç',
        color: '#c084fc',
    },
];

const DEMO_COURTS = [
    { name: 'Kort 1 — Kapalı Alan', surface: '🏟️ Sert', indoor: true,  fee: '120₺/saat', available: true  },
    { name: 'Kort 2 — Açık Alan',   surface: '🌿 Toprak', indoor: false, fee: '80₺/saat',  available: false },
    { name: 'Kort 3 — VIP Salon',   surface: '🏟️ Halı',  indoor: true,  fee: '200₺/saat', available: true  },
];

function PackageCard({ pkg, onSelect }) {
    return (
        <View style={[s.pkgCard, { borderColor: pkg.color + '60' }, pkg.tag && { borderColor: pkg.color, borderWidth: 2 }]}>
            {pkg.tag && (
                <View style={[s.pkgTag, { backgroundColor: pkg.color }]}>
                    <Text style={s.pkgTagText}>{pkg.tag}</Text>
                </View>
            )}
            <Text style={s.pkgIcon}>{pkg.icon}</Text>
            <Text style={[s.pkgName, { color: pkg.color }]}>{pkg.name}</Text>
            <View style={s.pkgPriceRow}>
                <Text style={[s.pkgPrice, { color: pkg.color }]}>{pkg.price}₺</Text>
                <Text style={s.pkgPeriod}>/{pkg.period}</Text>
            </View>
            <View style={s.pkgDivider} />
            {pkg.features.map((f, i) => (
                <View key={i} style={s.featureRow}>
                    <Text style={[s.featureDot, { color: pkg.color }]}>✓</Text>
                    <Text style={s.featureText}>{f}</Text>
                </View>
            ))}
            <TouchableOpacity
                style={[s.pkgBtn, { backgroundColor: pkg.color }]}
                onPress={() => onSelect(pkg)}
                activeOpacity={0.8}
            >
                <Text style={s.pkgBtnText}>{pkg.cta}</Text>
            </TouchableOpacity>
        </View>
    );
}

function DemoCourtCard({ court }) {
    return (
        <View style={s.demoCard}>
            <View style={s.demoCardInner}>
                <View style={{ flex: 1 }}>
                    <Text style={s.demoCourtName} numberOfLines={1}>{court.name}</Text>
                    <Text style={s.demoCourtMeta}>{court.surface}  ·  {court.indoor ? '🏠 Kapalı' : '🌤 Açık'}</Text>
                    <Text style={[s.demoCourtAvail, { color: court.available ? '#4ade80' : '#f87171' }]}>
                        {court.available ? '● Müsait' : '● Dolu'}
                    </Text>
                </View>
                <View style={s.demoFeeBox}>
                    <Text style={s.demoFee}>{court.fee}</Text>
                </View>
            </View>
            {/* Demo overlay */}
            <View style={s.demoOverlay}>
                <Text style={s.demoOverlayText}>Demo</Text>
            </View>
        </View>
    );
}

export default function BusinessHomeScreen() {
    const dispatch = useDispatch();
    const user = useSelector(s => s.auth.user);
    const [selectedPkg, setSelectedPkg] = useState(null);

    const handleSelect = (pkg) => {
        setSelectedPkg(pkg.key);
        Alert.alert(
            `${pkg.icon} ${pkg.name} Paketi`,
            'Bu özellik yakında aktif olacak. Şu an için demo modundayız.',
            [{ text: 'Tamam' }]
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

            {/* Header */}
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <View>
                    <Text style={s.headerBadge}>🏢 İŞLETME HESABI</Text>
                    <Text style={s.headerBiz} numberOfLines={1}>{user?.businessName || user?.fullName || 'İşletme'}</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
                    <Text style={s.logoutText}>Çıkış</Text>
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

                {/* Hoş geldin */}
                <View style={s.welcomeBox}>
                    <Text style={s.welcomeTitle}>Hoş geldiniz! 👋</Text>
                    <Text style={s.welcomeDesc}>
                        AcTiViTy İşletme Platformu'na hoş geldiniz. Kort ve sahalarınızı
                        binlerce sporcuya kolayca ulaştırın.{'\n\n'}
                        Aşağıdan ihtiyacınıza uygun paketi seçin.
                    </Text>
                </View>

                {/* Paketler */}
                <Text style={s.sectionTitle}>📦 Aylık Paketler</Text>
                {PACKAGES.map(pkg => (
                    <PackageCard key={pkg.key} pkg={pkg} onSelect={handleSelect} />
                ))}

                {/* Demo Bölümü */}
                <View style={s.demoSection}>
                    <View style={s.demoHeader}>
                        <Text style={s.sectionTitle}>🎯 Örnek Görünüm</Text>
                        <View style={s.demoBadge}>
                            <Text style={s.demoBadgeText}>DEMO</Text>
                        </View>
                    </View>
                    <Text style={s.demoDesc}>
                        Paket aldıktan sonra kortlarınız kullanıcılara bu şekilde görünecek:
                    </Text>
                    {DEMO_COURTS.map((c, i) => (
                        <DemoCourtCard key={i} court={c} />
                    ))}
                    <View style={s.comingSoonBox}>
                        <Text style={s.comingSoonIcon}>🚀</Text>
                        <Text style={s.comingSoonTitle}>Çok Yakında</Text>
                        <Text style={s.comingSoonDesc}>
                            Rezervasyon takvimi, gelir raporları ve daha fazlası geliyor.
                            Şu an demo modundayız, yakında tüm özellikler aktif olacak.
                        </Text>
                    </View>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root:   { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingHorizontal: 16, paddingBottom: 16 },

    // Header
    header:     { backgroundColor: colors.surface, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderColor: BIZ_COLOR + '30', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    headerBadge:{ color: BIZ_COLOR, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 3 },
    headerBiz:  { color: '#fff', fontSize: 18, fontWeight: '900', maxWidth: 220 },
    logoutBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#ef444440', backgroundColor: '#ef444410' },
    logoutText: { color: '#f87171', fontSize: 12, fontWeight: '700' },

    // Welcome
    welcomeBox:  { backgroundColor: BIZ_DIM, borderRadius: 14, padding: 14, marginTop: 16, marginBottom: 20, borderWidth: 1, borderColor: BIZ_COLOR + '30' },
    welcomeTitle:{ color: BIZ_LIGHT, fontSize: 16, fontWeight: '900', marginBottom: 8 },
    welcomeDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },

    // Section
    sectionTitle: { color: '#fff', fontSize: 15, fontWeight: '900', marginBottom: 12 },

    // Package card
    pkgCard:     { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.border, position: 'relative' },
    pkgTag:      { position: 'absolute', top: -1, right: 14, paddingHorizontal: 10, paddingVertical: 4, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
    pkgTagText:  { color: '#fff', fontSize: 10, fontWeight: '900' },
    pkgIcon:     { fontSize: 28, marginBottom: 6 },
    pkgName:     { fontSize: 18, fontWeight: '900', marginBottom: 4 },
    pkgPriceRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
    pkgPrice:    { fontSize: 32, fontWeight: '900' },
    pkgPeriod:   { color: colors.textMuted, fontSize: 14, marginBottom: 5, marginLeft: 3 },
    pkgDivider:  { height: 1, backgroundColor: colors.border, marginBottom: 12 },
    featureRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 3, marginBottom: 6 },
    featureDot:  { fontSize: 13, fontWeight: '900', marginTop: 1 },
    featureText: { color: colors.textSecondary, fontSize: 13, flex: 1 },
    pkgBtn:      { borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 14 },
    pkgBtnText:  { color: '#fff', fontWeight: '900', fontSize: 14 },

    // Demo
    demoSection: { marginTop: 8 },
    demoHeader:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 },
    demoBadge:   { backgroundColor: '#f59e0b', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    demoBadgeText: { color: '#000', fontSize: 10, fontWeight: '900' },
    demoDesc:    { color: colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 18 },

    demoCard:    { backgroundColor: colors.surface, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', position: 'relative' },
    demoCardInner: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 3 },
    demoCourtName: { color: '#fff', fontSize: 13, fontWeight: '800', marginBottom: 4 },
    demoCourtMeta: { color: colors.textMuted, fontSize: 11, marginBottom: 4 },
    demoCourtAvail: { fontSize: 11, fontWeight: '700' },
    demoFeeBox:  { backgroundColor: colors.surface2, borderRadius: 8, padding: 8, alignItems: 'center', minWidth: 80 },
    demoFee:     { color: BIZ_LIGHT, fontSize: 13, fontWeight: '900' },

    demoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000055', justifyContent: 'center', alignItems: 'center' },
    demoOverlayText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 3, opacity: 0.7, backgroundColor: '#00000088', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },

    // Coming soon
    comingSoonBox:  { backgroundColor: '#7c3aed18', borderRadius: 14, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#7c3aed40', alignItems: 'center' },
    comingSoonIcon: { fontSize: 30, marginBottom: 8 },
    comingSoonTitle:{ color: '#c084fc', fontSize: 15, fontWeight: '900', marginBottom: 6 },
    comingSoonDesc: { color: colors.textSecondary, fontSize: 12, lineHeight: 19, textAlign: 'center' },
});
