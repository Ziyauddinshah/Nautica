/** @file Provides English/Hindi language state and translated UI text. */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translate } from './catalog.js';
const KEY = 'nautica.language';
const Context = createContext({
  locale: 'en',
  setLocale: () => {},
  t: (value, variables) => translate(value, variables, 'en'),
});
export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'hi' ? 'hi' : 'en';
    } catch {
      return 'en';
    }
  });
  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(KEY, locale);
    } catch {}
  }, [locale]);
  const value = useMemo(
    () => ({
      locale,
      setLocale: (next) => setLocale(next === 'hi' ? 'hi' : 'en'),
      t: (value, variables) => translate(value, variables, locale),
    }),
    [locale],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useI18n = () => useContext(Context);
export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="language-switch">
      <span className="sr-only">{t('Language')}</span>
      <select
        aria-label={t('Language')}
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
      >
        <option value="en">English</option>
        <option value="hi">हिन्दी</option>
      </select>
    </label>
  );
}
