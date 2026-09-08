import { NEW_VISUAL } from './visual';

const oldColors = {
    bg: '#030712',
    surface: '#111827',
    surface2: '#1f2937',
    border: '#374151',
    borderLight: '#4b5563',
    text: '#f9fafb',
    textSecondary: '#9ca3af',
    textMuted: '#6b7280',
    purple: '#9333ea',
    purpleLight: '#a855f7',
    green: '#16a34a',
    greenLight: '#22c55e',
    yellow: '#eab308',
    red: '#dc2626',
    blue: '#2563eb',
    ctaText: '#ffffff',
};

const newColors = {
    bg: '#0B0C10',
    surface: '#16181F',
    surface2: '#1C1F28',
    border: '#2A2D36',
    borderLight: '#3A3E48',
    text: '#F4F1EA',
    textSecondary: '#A8A29A',
    textMuted: '#78716C',
    // Eski kod colors.purple'ı birincil vurgu sanıyor — yeni dilde lime.
    purple: '#C8F54A',
    purpleLight: '#D4F86A',
    green: '#16a34a',
    greenLight: '#22c55e',
    yellow: '#eab308',
    red: '#dc2626',
    blue: '#2563eb',
    ctaText: '#0B0C10',
};

export default NEW_VISUAL ? newColors : oldColors;
