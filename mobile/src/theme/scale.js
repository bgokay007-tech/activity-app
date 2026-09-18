import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Reference design size (iPhone 8/X-ish width) — most RN screens in this app were sized against it.
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

export const scale = (size) => (SCREEN_W / BASE_WIDTH) * size;
export const verticalScale = (size) => (SCREEN_H / BASE_HEIGHT) * size;

// Large phones (≈400–430+) used to keep 375-designed type/buttons as a thin strip;
// boost growth so UI actually fills the screen and stays tappable.
const LARGE_BOOST = SCREEN_W >= 420 ? 1.14 : SCREEN_W >= 390 ? 1.08 : 1;

// Scales less aggressively than scale() — readable on small phones, roomy on large ones.
export const moderateScale = (size, factor = 0.72) => {
    const value = (size + (scale(size) - size) * factor) * LARGE_BOOST;
    return PixelRatio.roundToNearestPixel(value);
};

/** Touch-friendly control height (min ~44 on base, grows with screen). */
export const touchSize = (size = 44) => Math.max(moderateScale(size), 44);
