import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import tr from './locales/tr.json';
import ru from './locales/ru.json';

const saved = localStorage.getItem('activity_lang') || 'en';

i18n
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            tr: { translation: tr },
            ru: { translation: ru },
        },
        lng: saved,
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
    });

export default i18n;
