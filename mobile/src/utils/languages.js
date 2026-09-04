// Uygulamanın desteklediği diller — yeni dil eklendikçe alfabetik sıraya (label'a göre) eklenir.
export const LANGUAGES = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
].sort((a, b) => a.label.localeCompare(b.label));

export function getLanguageLabel(code) {
    return LANGUAGES.find(l => l.code === code)?.label || code;
}
