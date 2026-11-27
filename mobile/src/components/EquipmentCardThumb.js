import { useEffect, useRef, useState } from 'react';
import { View, Image, Text, ScrollView, StyleSheet, Pressable } from 'react-native';

/**
 * Ekipman liste kartı görseli — detaya girmeden sola kaydırınca diğer fotoğraflar.
 * Tek tıklama (kaydırma değil) → onPress ile ilan detayı.
 * isAd + adImages varsa otomatik dönen reklam görselleri; yoksa ürün fotoğrafları.
 */
export default function EquipmentCardThumb({
    images = [],
    adImages = [],
    isAd = false,
    height = 120,
    adBadgeLabel = 'Reklam',
    onPress,
}) {
    const product = (Array.isArray(images) ? images : []).filter((u) => typeof u === 'string' && u);
    const ads = (Array.isArray(adImages) ? adImages : []).filter((u) => typeof u === 'string' && u);
    const slides = (isAd && ads.length > 0) ? ads : product;
    const [idx, setIdx] = useState(0);
    const [w, setW] = useState(0);
    const scrollRef = useRef(null);
    const autoRef = useRef(null);

    useEffect(() => {
        setIdx(0);
        scrollRef.current?.scrollTo?.({ x: 0, animated: false });
    }, [slides.join('|')]);

    // Reklam: arka arkaya otomatik geçiş
    useEffect(() => {
        if (!(isAd && ads.length > 1) || w <= 0) return undefined;
        autoRef.current = setInterval(() => {
            setIdx((prev) => {
                const next = (prev + 1) % ads.length;
                scrollRef.current?.scrollTo?.({ x: next * w, animated: true });
                return next;
            });
        }, 2800);
        return () => clearInterval(autoRef.current);
    }, [isAd, ads.length, w]);

    const badges = (
        <>
            {isAd ? (
                <View style={s.adBadge} pointerEvents="none">
                    <Text style={s.adBadgeTxt}>{adBadgeLabel}</Text>
                </View>
            ) : null}
            {slides.length > 1 ? (
                <View style={s.dots} pointerEvents="none">
                    {slides.map((_, i) => (
                        <View key={i} style={[s.dot, i === idx && s.dotOn]} />
                    ))}
                </View>
            ) : null}
            {!isAd && slides.length > 1 ? (
                <View style={s.count} pointerEvents="none">
                    <Text style={s.countTxt}>📷 {slides.length}</Text>
                </View>
            ) : null}
        </>
    );

    if (!slides.length) {
        return (
            <Pressable
                onPress={onPress}
                disabled={!onPress}
                style={[s.empty, { height }]}
            >
                <Text style={{ fontSize: 36 }}>📦</Text>
            </Pressable>
        );
    }

    if (slides.length === 1) {
        return (
            <Pressable
                onPress={onPress}
                disabled={!onPress}
                style={{ height, width: '100%' }}
                onLayout={(e) => setW(e.nativeEvent.layout.width)}
            >
                <Image source={{ uri: slides[0] }} style={{ width: '100%', height }} resizeMode="cover" />
                {badges}
            </Pressable>
        );
    }

    return (
        <View
            style={{ height, width: '100%' }}
            onLayout={(e) => setW(e.nativeEvent.layout.width)}
        >
            {w > 0 ? (
                <ScrollView
                    ref={scrollRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    nestedScrollEnabled
                    onMomentumScrollEnd={(e) => {
                        const x = e.nativeEvent.contentOffset.x;
                        const i = Math.round(x / Math.max(1, w));
                        if (i >= 0 && i < slides.length) setIdx(i);
                    }}
                >
                    {slides.map((uri, i) => (
                        <Pressable
                            key={`${uri}-${i}`}
                            onPress={onPress}
                            disabled={!onPress}
                            style={{ width: w, height }}
                        >
                            <Image
                                source={{ uri }}
                                style={{ width: w, height }}
                                resizeMode="cover"
                            />
                        </Pressable>
                    ))}
                </ScrollView>
            ) : null}
            {badges}
        </View>
    );
}

const s = StyleSheet.create({
    empty: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1e293b',
    },
    adBadge: {
        position: 'absolute',
        top: 6,
        right: 6,
        backgroundColor: '#a855f7',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    adBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
    dots: {
        position: 'absolute',
        bottom: 6,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 4,
    },
    dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#ffffff55' },
    dotOn: { backgroundColor: '#fff', width: 12 },
    count: {
        position: 'absolute',
        bottom: 6,
        right: 6,
        backgroundColor: '#000000aa',
        borderRadius: 6,
        paddingHorizontal: 5,
        paddingVertical: 1,
    },
    countTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
