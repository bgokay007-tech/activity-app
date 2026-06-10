import { useRef, useEffect } from 'react';
import { Animated, Easing, Text } from 'react-native';

const COLORS = ['#FF0000','#FF6600','#FFD700','#00CC00','#00CED1','#0099FF','#7B00FF','#FFFFFF'];
const N = COLORS.length; // 8
const CYCLE_MS = 2400;   // matches web

export default function RainbowLogo({ style }) {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.timing(anim, {
                toValue: N,
                duration: CYCLE_MS,
                easing: Easing.linear,
                useNativeDriver: false,
            })
        ).start();
        return () => anim.stopAnimation();
    }, []);

    const letters = 'AcTiViTy'.split('');

    return (
        <Text style={[{ fontSize: 28, fontWeight: '900', letterSpacing: 2, textAlign: 'center' }, style]}>
            {letters.map((ch, i) => {
                // Same wave direction as web: last letter (y) starts red, first (A) starts white
                const offset = N - 1 - i;
                const inputRange  = Array.from({ length: N + 1 }, (_, k) => k);
                const outputRange = Array.from({ length: N + 1 }, (_, k) =>
                    COLORS[(k + offset) % N]
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
