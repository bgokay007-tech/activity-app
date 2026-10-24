import { useSelector } from 'react-redux';
import { en, tr, ru, de } from '../i18n';
import { en as lzEn, tr as lzTr, ru as lzRu, de as lzDe } from '../i18n/packs/leisure';
import { en as bizEn, tr as bizTr, ru as bizRu, de as bizDe } from '../i18n/packs/business';
import { en as shEn, tr as shTr, ru as shRu, de as shDe } from '../i18n/packs/shell';
import { en as scEn, tr as scTr, ru as scRu, de as scDe } from '../i18n/packs/subcategory';

const dict = {
    en: { ...en, ...lzEn, ...bizEn, ...shEn, ...scEn },
    tr: { ...tr, ...lzTr, ...bizTr, ...shTr, ...scTr },
    ru: { ...ru, ...lzRu, ...bizRu, ...shRu, ...scRu },
    de: { ...de, ...lzDe, ...bizDe, ...shDe, ...scDe },
};

export default function useT() {
    const lang = useSelector(s => s.lang?.lang || 'en');
    return dict[lang] || dict.en;
}
