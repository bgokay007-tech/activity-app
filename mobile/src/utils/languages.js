// Uygulamanın desteklediği diller — yeni dil eklendikçe buraya eklenir.
export const LANGUAGES = [
    { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
];

export function getLanguageLabel(code) {
    return LANGUAGES.find(l => l.code === code)?.label || code;
}
