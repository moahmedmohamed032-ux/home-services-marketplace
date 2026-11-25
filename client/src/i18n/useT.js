import { useSelector } from 'react-redux';
import { translations } from './translations';

export function useT() {
  const lang = useSelector((s) => s.ui.lang);
  const t = (key) => translations[lang][key] ?? translations.en[key] ?? key;
  return { t, lang };
}
