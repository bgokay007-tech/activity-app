import { Dimensions } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Reference design size (iPhone 8/X-ish width) — most RN screens in this app were sized against it.
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

export const scale = (size) => (SCREEN_W / BASE_WIDTH) * size;
export const verticalScale = (size) => (SCREEN_H / BASE_HEIGHT) * size;

// Scales less aggressively than scale() — keeps text/controls readable on both
// small phones and tablets instead of growing/shrinking 1:1 with screen width.
export const moderateScale = (size, factor = 0.5) => size + (scale(size) - size) * factor;
