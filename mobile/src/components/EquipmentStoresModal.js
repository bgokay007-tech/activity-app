import { useCallback, useEffect, useState } from 'react';
import {
    View, Text, Modal, ScrollView, TouchableOpacity, TextInput,
    ActivityIndicator, Image, Linking, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import colors from '../theme/colors';

/**
 * Ekipman → Mağazalar: liste, detay, çapraz ürün arama/sıralama.
 */
export default function EquipmentStoresModal({
    visible,
    onClose,
    category,
    subCategory,
    accentColor = '#22c55e',
    t,
}) {
    const insets = useSafeAreaInsets();
    const [view, setView] = useState('hub'); // hub | detail
    const [hubTab, setHubTab] = useState('stores'); // stores | products
    const [stores, setStores] = useState([]);
    const [products, setProducts] = useState([]);
    const [selectedStore, setSelectedStore] = useState(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [q, setQ] = useState('');
    const [sort, setSort] = useState('price_asc');
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');
    const [showFilter, setShowFilter] = useState(false);

    const reset = () => {
        setView('hub');
        setHubTab('stores');
        setSelectedStore(null);
        setQ('');
        setSort('price_asc');
        setMinPrice('');
        setMaxPrice('');
        setShowFilter(false);
    };

    const loadStores = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ category, subCategory });
            if (q.trim()) params.set('q', q.trim());
            const { data } = await api.get(`/equipment/stores?${params}`);
            setStores(Array.isArray(data) ? data : []);
        } catch {
            setStores([]);
        } finally {
            setLoading(false);
        }
    }, [category, subCategory, q]);

    const loadProducts = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ category, subCategory, sort });
            if (q.trim()) params.set('q', q.trim());
            if (minPrice) params.set('minPrice', minPrice);
            if (maxPrice) params.set('maxPrice', maxPrice);
            const { data } = await api.get(`/equipment/stores/products?${params}`);
            setProducts(Array.isArray(data) ? data : []);
        } catch {
            setProducts([]);
        } finally {
            setLoading(false);
        }
    }, [category, subCategory, q, sort, minPrice, maxPrice]);

    const openStore = async (id) => {
        setLoading(true);
        try {
            const { data } = await api.get(`/equipment/stores/${id}`);
            setSelectedStore(data);
            setView('detail');
        } catch {
            setSelectedStore(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!visible) {
            reset();
            return;
        }
        if (hubTab === 'stores') loadStores();
        else loadProducts();
    }, [visible, hubTab]);

    useEffect(() => {
        if (!visible || view !== 'hub') return;
        const task = setTimeout(() => {
            if (hubTab === 'stores') loadStores();
            else loadProducts();
        }, 350);
        return () => clearTimeout(task);
    }, [q, sort, minPrice, maxPrice, visible, view, hubTab, loadStores, loadProducts]);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            if (view === 'detail' && selectedStore?.id) await openStore(selectedStore.id);
            else if (hubTab === 'stores') await loadStores();
            else await loadProducts();
        } finally {
            setRefreshing(false);
        }
    };

    const openUrl = (url) => {
        if (!url) return;
        Linking.openURL(url).catch(() => {});
    };
    const callPhone = (phone) => {
        if (!phone) return;
        Linking.openURL(`tel:${String(phone).replace(/\s/g, '')}`).catch(() => {});
    };

    const filterActive = !!(q || minPrice || maxPrice || sort !== 'price_asc');

    const ProductCard = ({ p, showStore }) => (
        <TouchableOpacity
            onPress={() => (p.productUrl ? openUrl(p.productUrl) : (p.store?.id && openStore(p.store.id)))}
            activeOpacity={0.85}
            style={{
                width: '48%', backgroundColor: colors.surface2, borderRadius: 12, overflow: 'hidden',
                borderWidth: 1, borderColor: colors.border, marginBottom: 8,
            }}
        >
            {p.imageUrl ? (
                <Image source={{ uri: p.imageUrl }} style={{ width: '100%', height: 110 }} resizeMode="cover" />
            ) : (
                <View style={{ height: 110, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 28 }}>📦</Text>
                </View>
            )}
            <View style={{ padding: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={2}>{p.title}</Text>
                <Text style={{ color: accentColor, fontSize: 13, fontWeight: '900', marginTop: 2 }}>
                    {p.price > 0 ? `${p.price} ${p.currency || '₺'}` : (t.equipStorePriceAsk || 'Fiyat sorun')}
                </Text>
                {p.stock != null && (
                    <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>
                        {(t.equipStoreStock || 'Stok')}: {p.stock}
                    </Text>
                )}
                {showStore && p.store?.name ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                        🏪 {p.store.name}
                    </Text>
                ) : null}
            </View>
        </TouchableOpacity>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' }}>
                <View style={{
                    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
                    maxHeight: '92%', paddingBottom: Math.max(insets.bottom, 12),
                }}>
                    <View style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
                        borderBottomWidth: 1, borderBottomColor: colors.border,
                    }}>
                        <TouchableOpacity
                            onPress={() => {
                                if (view === 'detail') { setView('hub'); setSelectedStore(null); }
                                else onClose();
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: '700' }}>
                                {view === 'detail' ? '←' : '✕'}
                            </Text>
                        </TouchableOpacity>
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }} numberOfLines={1}>
                            {view === 'detail'
                                ? (selectedStore?.name || (t.equipStoreDetail || 'Mağaza'))
                                : (t.equipStoresTitle || 'Mağazalar')}
                        </Text>
                        {view === 'hub' ? (
                            <TouchableOpacity onPress={() => setShowFilter(v => !v)}>
                                <Text style={{ color: filterActive ? accentColor : colors.textSecondary, fontSize: 13, fontWeight: '800' }}>
                                    {t.filterBtn || 'Filtre'}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={{ width: 40 }} />
                        )}
                    </View>

                    {view === 'hub' && (
                        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
                            {['stores', 'products'].map((tab) => (
                                <TouchableOpacity
                                    key={tab}
                                    onPress={() => setHubTab(tab)}
                                    style={{
                                        flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center',
                                        backgroundColor: hubTab === tab ? accentColor : colors.surface2,
                                        borderWidth: 1, borderColor: hubTab === tab ? accentColor : colors.border,
                                    }}
                                >
                                    <Text style={{ color: hubTab === tab ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>
                                        {tab === 'stores'
                                            ? (t.equipStoresTab || 'Mağazalar')
                                            : (t.equipStoreProductsTab || 'Ürünler')}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {view === 'hub' && showFilter && (
                        <View style={{ paddingHorizontal: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                            <TextInput
                                placeholder={hubTab === 'stores'
                                    ? (t.equipStoreSearchPh || 'Mağaza adı...')
                                    : (t.equipStoreProductSearchPh || 'Wilson, raket...')}
                                placeholderTextColor={colors.textMuted}
                                value={q}
                                onChangeText={setQ}
                                style={{
                                    backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 11,
                                    paddingVertical: 8, color: '#fff', borderWidth: 1, borderColor: colors.border, marginBottom: 8,
                                }}
                            />
                            {hubTab === 'products' && (
                                <>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                        {[
                                            { id: 'price_asc', label: t.equipStoreSortPriceAsc || 'Fiyat ↑' },
                                            { id: 'price_desc', label: t.equipStoreSortPriceDesc || 'Fiyat ↓' },
                                            { id: 'name', label: t.equipStoreSortName || 'Ad' },
                                            { id: 'newest', label: t.equipStoreSortNewest || 'Yeni' },
                                        ].map((s) => (
                                            <TouchableOpacity
                                                key={s.id}
                                                onPress={() => setSort(s.id)}
                                                style={{
                                                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                                                    backgroundColor: sort === s.id ? accentColor : colors.surface2,
                                                    borderWidth: 1, borderColor: sort === s.id ? accentColor : colors.border,
                                                }}
                                            >
                                                <Text style={{ color: sort === s.id ? '#fff' : colors.textSecondary, fontSize: 11, fontWeight: '700' }}>
                                                    {s.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 6 }}>
                                        <TextInput
                                            placeholder={t.sc_0897 || 'Min ₺'}
                                            placeholderTextColor={colors.textMuted}
                                            value={minPrice}
                                            onChangeText={(v) => setMinPrice(v.replace(/[^0-9]/g, ''))}
                                            keyboardType="numeric"
                                            style={{
                                                flex: 1, backgroundColor: colors.surface2, borderRadius: 10,
                                                paddingHorizontal: 11, paddingVertical: 8, color: '#fff',
                                                borderWidth: 1, borderColor: colors.border,
                                            }}
                                        />
                                        <TextInput
                                            placeholder={t.sc_0898 || 'Max ₺'}
                                            placeholderTextColor={colors.textMuted}
                                            value={maxPrice}
                                            onChangeText={(v) => setMaxPrice(v.replace(/[^0-9]/g, ''))}
                                            keyboardType="numeric"
                                            style={{
                                                flex: 1, backgroundColor: colors.surface2, borderRadius: 10,
                                                paddingHorizontal: 11, paddingVertical: 8, color: '#fff',
                                                borderWidth: 1, borderColor: colors.border,
                                            }}
                                        />
                                    </View>
                                </>
                            )}
                        </View>
                    )}

                    <ScrollView
                        style={{ maxHeight: 560 }}
                        contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
                        keyboardShouldPersistTaps="always"
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />}
                    >
                        {loading && !refreshing ? (
                            <ActivityIndicator color={accentColor} style={{ marginVertical: 24 }} />
                        ) : view === 'detail' && selectedStore ? (
                            <View>
                                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
                                    {selectedStore.city ? `📍 ${selectedStore.city}` : ''}
                                    {selectedStore.productCount != null || selectedStore.products
                                        ? ` · ${(selectedStore.products || []).length} ${t.equipStoreProductCount || 'ürün'}`
                                        : ''}
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                                    {selectedStore.phone ? (
                                        <TouchableOpacity
                                            onPress={() => callPhone(selectedStore.phone)}
                                            style={{
                                                flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
                                                backgroundColor: accentColor + '22', borderWidth: 1, borderColor: accentColor + '55',
                                            }}
                                        >
                                            <Text style={{ color: accentColor, fontWeight: '800', fontSize: 12 }}>
                                                {t.equipStoreCall || 'Ara'}
                                            </Text>
                                        </TouchableOpacity>
                                    ) : null}
                                    {selectedStore.websiteUrl ? (
                                        <TouchableOpacity
                                            onPress={() => openUrl(selectedStore.websiteUrl)}
                                            style={{
                                                flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
                                                backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
                                            }}
                                        >
                                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                                                {t.equipStoreWebsite || 'Web'}
                                            </Text>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                                {(selectedStore.products || []).length === 0 ? (
                                    <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 20 }}>
                                        {t.equipStoreNoProducts || 'Henüz ürün yok'}
                                    </Text>
                                ) : (
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                                        {selectedStore.products.map((p) => (
                                            <ProductCard key={p.id} p={p} showStore={false} />
                                        ))}
                                    </View>
                                )}
                            </View>
                        ) : hubTab === 'stores' ? (
                            stores.length === 0 ? (
                                <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 28 }}>
                                    {t.equipStoreEmpty || 'Henüz mağaza yok'}
                                </Text>
                            ) : (
                                stores.map((st) => (
                                    <TouchableOpacity
                                        key={st.id}
                                        onPress={() => openStore(st.id)}
                                        style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 12,
                                            padding: 12, marginBottom: 8, borderRadius: 12,
                                            backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
                                        }}
                                    >
                                        <View style={{
                                            width: 44, height: 44, borderRadius: 10, backgroundColor: accentColor + '25',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {st.logoUrl
                                                ? <Image source={{ uri: st.logoUrl }} style={{ width: 44, height: 44, borderRadius: 10 }} />
                                                : <Text style={{ fontSize: 20 }}>🏪</Text>}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }} numberOfLines={1}>{st.name}</Text>
                                            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                                                {st.city ? `${st.city} · ` : ''}
                                                {st.productCount ?? 0} {t.equipStoreProductCount || 'ürün'}
                                            </Text>
                                        </View>
                                        <Text style={{ color: colors.textMuted }}>›</Text>
                                    </TouchableOpacity>
                                ))
                            )
                        ) : products.length === 0 ? (
                            <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 28 }}>
                                {t.equipStoreNoProducts || 'Ürün bulunamadı'}
                            </Text>
                        ) : (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                                {products.map((p) => (
                                    <ProductCard key={p.id} p={p} showStore />
                                ))}
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}
