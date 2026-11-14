import { useRef, useEffect } from 'react';
import { Animated, Easing, Text } from 'react-native';
import { ACTIVITY_RAINBOW, ACTIVITY_RAINBOW_CYCLE_MS } from '../theme/activityRainbow';

const N = ACTIVITY_RAINBOW.length;

export default function RainbowLogo({ style, text = 'AcTiViTy' }) {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.timing(anim, {
                toValue: N,
                duration: ACTIVITY_RAINBOW_CYCLE_MS,
                easing: Easing.linear,
                useNativeDriver: false,
            })
        ).start();
        return () => anim.stopAnimation();
    }, []);

    const letters = text.split('');

    return (
        <Text style={[{ fontSize: 28, fontWeight: '900', letterSpacing: 2, textAlign: 'center' }, style]}>
            {letters.map((ch, i) => {
                // Same wave direction as web: last letter (y) starts red, first (A) starts white
                const offset = N - 1 - i;
                const inputRange  = Array.from({ length: N + 1 }, (_, k) => k);
                const outputRange = Array.from({ length: N + 1 }, (_, k) =>
                    ACTIVITY_RAINBOW[(k + offset) % N]
                );
                const color = anim.interpolate({ inputRange, outputRange });
                return (
                    <Animated.Text key={i} style={{ color }}>
                        {ch}
                    </Animated.Text>
                );
            })}
        </Text>
    );
}
