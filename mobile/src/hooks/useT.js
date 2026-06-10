import { useSelector } from 'react-redux';
import { en, tr } from '../i18n';

export default function useT() {
    const lang = useSelector(s => s.lang?.lang || 'en');
    return lang === 'tr' ? tr : en;
}
