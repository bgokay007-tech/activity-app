import { useEffect, useRef, useState } from 'react';
import {
    Modal, View, Image, Text, TouchableOpacity, Linking, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';

const INTERVAL_MS = 30000;
const CLOSE_AFTER_MS = 5000;
const { width: WIN_W, height: WIN_H } = Dimensions.get('window');

/**
 * Dal içinde aktif mağaza/bireysel reklamları ~30 sn'de bir tam ekran gösterir.
 * Kapatma butonu 5 sn sonra gelir. Kendi reklamı gösterilmez.
 */
export default function EquipmentAdInterstitial({
    enabled,
    category,
    subCategory,
    myUserId,
    t,
}) {
    const insets = useSafeAreaInsets();
    const [pool, setPool] = useState([]);
    const [current, setCurrent] = useState(null);
    const [canClose, setCanClose] = useState(false);
    const [imgIdx, setImgIdx] = useState(0);
    const tickRef = useRef(null);
    const closeRef = useRef(null);
    const rotateRef = useRef(null);
    const poolRef = useRef([]);
    const idxRef = useRef(0);

    useEffect(() => { poolRef.current = pool; }, [pool]);

    const loadAds = async () => {
        if (!enabled || !subCategory) return;
        try {
            const params = new URLSearchParams({ subCategory });
            if (category) params.set('category', category);
            const { data } = await api.get(`/equipment/ads/active?${params}`);
            const list = (data?.ads || []).filter((a) => a.userId !== myUserId && (a.adImages || []).length > 0);
            setPool(list);
            poolRef.current = list;
        } catch {
            setPool([]);
            poolRef.current = [];
        }
    };

    useEffect(() => {
        if (!enabled) {
            setCurrent(null);
            setPool([]);
            return undefined;
        }
        loadAds();
        const refresh = setInterval(loadAds, 120000);
        return () => clearInterval(refresh);
    }, [enabled, category, subCategory, myUserId]);

    useEffect(() => {
        if (!enabled) {
            if (tickRef.current) clearInterval(tickRef.current);
            return undefined;
        }
        tickRef.current = setInterval(() => {
            const list = poolRef.current;
            if (!list.length || current) return;
            const i = idxRef.current % list.length;
            idxRef.current = i + 1;
            setImgIdx(0);
            setCanClose(false);
            setCurrent(list[i]);
        }, INTERVAL_MS);
        return () => {
            if (tickRef.current) clearInterval(tickRef.current);
        };
    }, [enabled, current]);

    useEffect(() => {
        if (!current) {
            if (closeRef.current) clearTimeout(closeRef.current);
            if (rotateRef.current) clearInterval(rotateRef.current);
            return undefined;
        }
        setCanClose(false);
        closeRef.current = setTimeout(() => setCanClose(true), CLOSE_AFTER_MS);
        const imgs = current.adImages || [];
        if (imgs.length > 1) {
            rotateRef.current = setInterval(() => {
                setImgIdx((p) => (p + 1) % imgs.length);
            }, 2500);
        }
        return () => {
            if (closeRef.current) clearTimeout(closeRef.current);
            if (rotateRef.current) clearInterval(rotateRef.current);
        };
    }, [current]);

    const close = () => {
        setCurrent(null);
        setCanClose(false);
    };

    const openLink = () => {
        const url = current?.adUrl;
        if (url) Linking.openURL(url).catch(() => {});
    };

    if (!current) return null;
    const uri = (current.adImages || [])[imgIdx] || current.adImages?.[0];

    return (
        <Modal visible animationType="fade" transparent={false} onRequestClose={() => { if (canClose) close(); }}>
            <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top, paddingBottom: insets.bottom }}>
                <TouchableOpacity activeOpacity={0.95} onPress={openLink} style={{ flex: 1 }}>
                    {uri ? (
                        <Image
                            source={{ uri }}
                            style={{ width: WIN_W, height: WIN_H - insets.top - insets.bottom - 72, alignSelf: 'center' }}
                            resizeMode="contain"
                        />
                    ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{current.title}</Text>
                        </View>
                    )}
                </TouchableOpacity>
                <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center' }} numberOfLines={1}>
                        {current.title}
                    </Text>
                    <Text style={{ color: '#a855f7', fontSize: 11, fontWeight: '700', textAlign: 'center' }}>
                        {t?.equipAdBadge || 'Reklam'}
                        {current.type === 'store' ? ` · ${t?.equipStoresBtn || 'Mağaza'}` : ''}
                    </Text>
                    {canClose ? (
                        <TouchableOpacity
                            onPress={close}
                            style={{
                                marginTop: 4, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                                backgroundColor: '#ffffff22', borderWidth: 1, borderColor: '#ffffff44',
                            }}
                        >
                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                                {t?.equipAdClose || 'Kapat'}
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <Text style={{ color: '#ffffff66', textAlign: 'center', fontSize: 12, paddingVertical: 10 }}>
                            {t?.equipAdCloseSoon || 'Kapatma birkaç saniye içinde...'}
                        </Text>
                    )}
                </View>
            </View>
        </Modal>
    );
}
