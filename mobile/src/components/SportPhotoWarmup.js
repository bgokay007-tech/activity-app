import { useEffect, useState } from 'react';
import { View, Image, StyleSheet, InteractionManager } from 'react-native';
import { SUB_PHOTOS } from '../theme/visualAssets';
import { warmSportPhotos } from '../utils/warmSportPhotos';

const SPORT_IDS = [
    'tennis', 'padel', 'table_tennis', 'badminton', 'pickleball',
    'volleyball', 'football', 'basketball', 'foot_tennis', 'handball',
    'running', 'camping', 'climbing', 'golf', 'equestrian', 'archery', 'sup_kano',
    'wellness', 'fitness_gym', 'ice_skating',
    'motorcycle', 'skiing_snowboard', 'paintball', 'airsoft', 'extreme_sports', 'shooting_hunting',
];

// Ana sayfa boştayken spor dal JPEG'lerini çöz — Spor'a basınca decode kuyruğu oluşmasın.
export default function SportPhotoWarmup() {
    const [show, setShow] = useState(false);
    useEffect(() => {
        warmSportPhotos();
        const task = InteractionManager.runAfterInteractions(() => setShow(true));
        return () => task.cancel?.();
    }, []);
    if (!show) return null;
    return (
        <View style={s.hide} pointerEvents="none" accessible={false}>
            {SPORT_IDS.map((id) => {
                const src = SUB_PHOTOS[id];
                if (!src) return null;
                return <Image key={id} source={src} style={s.px} fadeDuration={0} />;
            })}
        </View>
    );
}

const s = StyleSheet.create({
    hide: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', left: 0, top: 0 },
    px: { width: 2, height: 2 },
});
