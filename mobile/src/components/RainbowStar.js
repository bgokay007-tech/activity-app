import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ACTIVITY_RAINBOW, ACTIVITY_RAINBOW_CYCLE_MS } from '../theme/activityRainbow';
import colors from '../theme/colors';

const N = ACTIVITY_RAINBOW.length;

/**
 * AkTiViTe sekmesi yıldızı: RainbowLogo 8 rengi, aynı anda faz kaymalı dalga.
 * Animated.createAnimatedComponent(Ionicons) RN'de native çökertiyordu (ana sayfa açılır açılmaz kapanma) —
 * bu yüzden düz Ionicons + rAF ile string renk güncellenir.
 */
export default function RainbowStar({ size = 22, active = false, style }) {
    const [phase, setPhase] = useState(0);

    useEffect(() => {
        if (!active) {
            setPhase(0);
            return undefined;
        }
        let raf = 0;
        const start = Date.now();
        const tick = () => {
            const t = ((Date.now() - start) % ACTIVITY_RAINBOW_CYCLE_MS) / ACTIVITY_RAINBOW_CYCLE_MS;
            setPhase(t * N);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [active]);

    if (!active) {
        return (
            <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
                <Ionicons name="star-outline" size={size} color={colors.textMuted} />
            </View>
        );
    }

    const colorAt = (offset) => {
        const idx = Math.floor((((phase + offset) % N) + N) % N);
        return ACTIVITY_RAINBOW[idx];
    };

    return (
        <View style={[{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }, style]}>
            {ACTIVITY_RAINBOW.map((_, i) => {
                const angle = (i / N) * Math.PI * 2;
                const r = 1.15;
                return (
                    <View
                        key={i}
                        style={{
                            position: 'absolute',
                            opacity: 0.72,
                            transform: [
                                { translateX: Math.cos(angle) * r },
                                { translateY: Math.sin(angle) * r },
                            ],
                        }}
                    >
                        <Ionicons name="star" size={size} color={colorAt(N - 1 - i)} />
                    </View>
                );
            })}
            <Ionicons name="star" size={size} color={colorAt(0)} />
        </View>
    );
}
