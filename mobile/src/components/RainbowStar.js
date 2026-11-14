import { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ACTIVITY_RAINBOW, ACTIVITY_RAINBOW_CYCLE_MS } from '../theme/activityRainbow';
import colors from '../theme/colors';

const AnimatedIon = Animated.createAnimatedComponent(Ionicons);
const N = ACTIVITY_RAINBOW.length;

/**
 * AkTiViTe sekmesi yıldızı: lime tek renk yerine RainbowLogo skalası —
 * 8 renk aynı anda, faz kaymalı dalga (sırayla tek tek yanma değil).
 * Ionicons glifi → marka emoji farkı yok.
 */
export default function RainbowStar({ size = 22, active = false, style }) {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!active) {
            anim.stopAnimation();
            anim.setValue(0);
            return undefined;
        }
        anim.setValue(0);
        const loop = Animated.loop(
            Animated.timing(anim, {
                toValue: N,
                duration: ACTIVITY_RAINBOW_CYCLE_MS,
                easing: Easing.linear,
                useNativeDriver: false,
            })
        );
        loop.start();
        return () => loop.stop();
    }, [active, anim]);

    if (!active) {
        return (
            <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
                <Ionicons name="star-outline" size={size} color={colors.textMuted} />
            </View>
        );
    }

    const inputRange = Array.from({ length: N + 1 }, (_, k) => k);

    return (
        <View style={[{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }, style]}>
            {/* 8 katman: her biri farklı fazda renk dalgası + hafif yayılım → aynı anda rengarenk */}
            {ACTIVITY_RAINBOW.map((_, i) => {
                const outputRange = Array.from({ length: N + 1 }, (_, k) =>
                    ACTIVITY_RAINBOW[(k + (N - 1 - i)) % N]
                );
                const color = anim.interpolate({ inputRange, outputRange });
                const angle = (i / N) * Math.PI * 2;
                const r = 1.15;
                return (
                    <AnimatedIon
                        key={i}
                        name="star"
                        size={size}
                        color={color}
                        style={{
                            position: 'absolute',
                            opacity: 0.72,
                            transform: [
                                { translateX: Math.cos(angle) * r },
                                { translateY: Math.sin(angle) * r },
                            ],
                        }}
                    />
                );
            })}
            {/* Merkez: dalganın ana fazı — dolu yıldız okunaklı kalsın */}
            <AnimatedIon
                name="star"
                size={size}
                color={anim.interpolate({
                    inputRange,
                    outputRange: [...ACTIVITY_RAINBOW, ACTIVITY_RAINBOW[0]],
                })}
                style={{ opacity: 0.98 }}
            />
        </View>
    );
}
